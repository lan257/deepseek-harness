#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
识图核心 + CLI —— 直接调 opencode go 的多模态模型（默认 mimo-v2.5）识图。

既可作为模块被 import（find_keys / load_image / recognize_with_failover /
extract_json_array / usage_line），也可命令行调用：
    python vision.py <图片路径|URL|dataURI> ["提示词"] [--model <模型>] [--json] [--json-out] [--timeout <秒>] [--config <文件>]

默认模型 mimo-v2.5（最便宜 $0.14/$0.28，带像素坐标，~20-27s）。
API key 自动从本 agent 配置读取，脚本内不硬编码任何密钥，优先级：
    1) 环境变量 OPENCODE_API_KEY
    2) opencode 认证文件 ~/.local/share/opencode/auth.json（opencode-go 条目优先）
    3) cc-switch 数据库 ~/.cc-switch/cc-switch.db（OpenCode Go provider 配置）
    4) --config 文件或 ~/.dsh/vision.json 里的 extraKeys / mimoKey

通道（失败自动切换配置）：
    主通道  opencode go  OpenAI 兼容  POST https://opencode.ai/zen/go/v1/chat/completions
    备用通道 MiMo 原生     Anthropic 兼容  POST https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages
    （仅当存在 MIMO_API_KEY / config.mimoKey 时启用）
每个密钥在主通道失败（HTTP 错误 / 超时 / 网络错误 / 空响应）后按顺序切换到下一个配置；
全部失败时报错并列出每次尝试。实测：Anthropic /v1/messages 网关传图 400、Responses
通道只接受公网 URL，因此本地图片走 OpenAI 通道的 image_url + base64 data URL。
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request

OPENAI_CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions"
MIMO_ANTHROPIC_URL = "https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages"
DEFAULT_MODEL = "mimo-v2.5"
# 单张 210KB 图实测成本（美元 / 1M token），用于估算
PRICE = {
    "mimo-v2.5": (0.14, 0.28),
    "mimo-v2.5-pro": (0.435, 0.87),
    "deepseek-v4-pro": (0.435, 0.87),
}

DEFAULT_PROMPT = (
    "请仔细识别这张图片，用中文回答："
    "1) 图中所有文字，逐字读出；"
    "2) 每个文字/UI 元素的位置，给出以图片像素为坐标系的 bbox（格式 [x,y,w,h] 或左上角坐标 [x,y]）；"
    "3) 一句话概括画面内容。若没有 UI/文字，就描述画面主体。"
)
JSON_PROMPT = (
    "请只输出一个 JSON 数组，每个元素形如 {\"text\":\"\",\"bbox\":[x,y,w,h]}，"
    "覆盖图中所有可读文字和 UI 元素。无法确定的字段标 null，不要输出数组以外的内容。\n"
)

OPCODE_AUTH_JSON = os.path.expanduser("~/.local/share/opencode/auth.json")
CC_SWITCH_DB = os.path.expanduser("~/.cc-switch/cc-switch.db")
USER_CONFIG = os.path.expanduser("~/.dsh/vision.json")


def collect_strings(obj):
    out = []
    if isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, str):
                out.append(v)
            else:
                out.extend(collect_strings(v))
    elif isinstance(obj, list):
        for v in obj:
            out.extend(collect_strings(v))
    return out


def _load_json(path):
    """读取 JSON 文件；不存在或损坏返回 None。"""
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def read_user_config(config_path=None):
    """合并 --config 指定的文件与默认 ~/.dsh/vision.json（前者优先）。"""
    merged = {}
    for path in (config_path, USER_CONFIG):
        data = _load_json(path)
        if isinstance(data, dict):
            for k, v in data.items():
                if k not in merged or merged[k] in (None, ""):
                    merged[k] = v
    return merged


def find_keys(config=None):
    """按优先级收集候选 API key，返回 [(key, source), ...]（已去重）。

    来源：环境变量 OPENCODE_API_KEY → opencode auth.json（opencode-go 条目优先，
    其余 api 条目兜底）→ cc-switch.db 中 opencode.ai 相关 provider 配置 →
    --config / ~/.dsh/vision.json 的 extraKeys。
    """
    config = config or {}
    keys = []

    def add(key, source):
        if isinstance(key, str) and key.startswith("sk-") and len(key) > 20:
            if not any(existing == key for existing, _ in keys):
                keys.append((key, source))

    env = os.environ.get("OPENCODE_API_KEY")
    if env:
        add(env, "env:OPENCODE_API_KEY")

    auth = _load_json(OPCODE_AUTH_JSON)
    if isinstance(auth, dict):
        for entry_name in ("opencode-go", "opencode", "zen"):
            entry = auth.get(entry_name)
            if isinstance(entry, dict) and entry.get("type") == "api":
                add(entry.get("key"), f"opencode auth.json:{entry_name}")
        for entry_name, entry in auth.items():
            if isinstance(entry, dict) and entry.get("type") == "api":
                add(entry.get("key"), f"opencode auth.json:{entry_name}")

    if os.path.isfile(CC_SWITCH_DB):
        try:
            conn = sqlite3.connect(CC_SWITCH_DB)
            conn.text_factory = lambda b: b.decode("utf-8", "replace")
            try:
                for (cfg_str,) in conn.execute("SELECT settings_config FROM providers"):
                    if not cfg_str:
                        continue
                    try:
                        cfg = json.loads(cfg_str)
                    except Exception:
                        continue
                    vals = collect_strings(cfg)
                    if not any("opencode.ai" in v for v in vals):
                        continue
                    for v in vals:
                        if v.startswith("sk-") and len(v) > 20:
                            add(v, "cc-switch.db")
            finally:
                conn.close()
        except Exception:
            pass

    for key in config.get("extraKeys") or []:
        add(key, "config:extraKeys")
    return keys


def find_mimo_key(config=None):
    """返回备用通道的 MiMo 密钥；无则返回 None。来源：环境变量 MIMO_API_KEY → config.mimoKey。"""
    config = config or {}
    key = os.environ.get("MIMO_API_KEY") or config.get("mimoKey")
    if isinstance(key, str) and key.startswith("sk-") and len(key) > 20:
        return key
    return None


def _probe_mime(raw):
    """按文件头探测图片类型；识别失败返回 None（不依赖扩展名）。"""
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


def load_image(spec):
    """把输入归一成 (base64_str, mime)。spec 支持：
    - 本地文件路径（mime 优先按文件头探测，其次按扩展名推断）
    - http(s):// URL（自动下载，遵守标准代理环境变量）
    - data:image/...;base64,<b64> 数据 URI
    """
    if spec.startswith("data:"):
        head, _, b64 = spec.partition(",")
        mime = head[len("data:"):].split(";")[0] or "image/jpeg"
        return b64, mime
    if spec.startswith("http://") or spec.startswith("https://"):
        req = urllib.request.Request(spec, headers={"user-agent": "codex/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
        b64 = base64.b64encode(raw).decode()
        mime = _probe_mime(raw) or r.headers.get_content_type() or "image/jpeg"
        return b64, mime
    if not os.path.isfile(spec):
        raise FileNotFoundError(f"图片不存在: {spec}")
    with open(spec, "rb") as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()
    mime = _probe_mime(raw) or mimetypes.guess_type(spec)[0] or "image/jpeg"
    return b64, mime


DEFAULT_PROXY = "http://127.0.0.1:7890"


def _post(url, payload, key, timeout_ms, proxy=None):
    """一次 POST 请求；成功返回响应文本，失败抛 RuntimeError。

    HTTP 错误（4xx/5xx）直接抛错；网络层错误（超时/DNS/SSL）在提供 proxy 时
    自动经代理重试一次，重试仍失败才抛错。
    """
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"authorization": "Bearer " + key, "content-type": "application/json",
                 "user-agent": "codex/1.0"},
    )
    for attempt in (0, 1):
        opener = None
        if attempt == 1 and proxy:
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        try:
            with (opener.open(req, timeout=timeout_ms) if opener
                  else urllib.request.urlopen(req, timeout=timeout_ms)) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:800]}")
        except Exception as e:
            if attempt == 0 and proxy:
                continue
            raise RuntimeError(f"请求失败: {type(e).__name__}: {e}")


def _parse_chat_response(body):
    """解析 OpenAI 兼容 chat/completions 响应，返回 (text, usage)。"""
    try:
        data = json.loads(body)
    except Exception:
        raise RuntimeError("响应非 JSON: " + body[:500])
    if data.get("error"):
        raise RuntimeError("模型错误: " + json.dumps(data["error"], ensure_ascii=False)[:500])
    texts = []
    choices = data.get("choices") or []
    if choices:
        msg = choices[0].get("message") or {}
        content = msg.get("content") or ""
        if isinstance(content, str):
            texts.append(content)
        elif isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get("type") in ("text", "output_text"):
                    texts.append(c.get("text", ""))
        if not texts and msg.get("reasoning_content"):
            texts.append(str(msg.get("reasoning_content", "")).strip())
    result = "\n".join(texts).strip()
    if not result:
        raise RuntimeError("模型返回空文本")
    usage = data.get("usage", {})
    if "input_tokens" not in usage and "prompt_tokens" in usage:
        usage = {
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        }
    return result, usage


def _parse_messages_response(body):
    """解析 Anthropic 兼容 /v1/messages 响应，返回 (text, usage)。"""
    try:
        data = json.loads(body)
    except Exception:
        raise RuntimeError("响应非 JSON: " + body[:500])
    if data.get("error"):
        raise RuntimeError("模型错误: " + json.dumps(data["error"], ensure_ascii=False)[:500])
    texts = []
    for block in data.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            texts.append(block.get("text", ""))
    result = "\n".join(texts).strip()
    if not result:
        raise RuntimeError("模型返回空文本")
    usage = data.get("usage", {})
    return result, {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }


def recognize_attempt(prompt, image_b64, mime, model, base_url, key, channel, timeout_ms):
    """单次识图请求；成功返回 (text, usage, dt)，失败抛 RuntimeError。"""
    t0 = time.time()
    if channel == "openai":
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
            ]}],
            "max_tokens": 2048,
        }
        text, usage = _parse_chat_response(_post(base_url, payload, key, timeout_ms))
    elif channel == "anthropic":
        payload = {
            "model": model,
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image", "source": {
                    "type": "base64", "media_type": mime, "data": image_b64,
                }},
            ]}],
        }
        text, usage = _parse_messages_response(_post(base_url, payload, key, timeout_ms))
    else:
        raise RuntimeError(f"未知通道: {channel}")
    return text, usage, time.time() - t0


def build_configs(model, config=None, keys=None):
    """构造按顺序尝试的配置列表 [(label, base_url, key, channel), ...]。

    主通道 opencode go OpenAI 兼容接口，每个候选密钥一个配置；备用通道
    MiMo 原生 Anthropic 接口仅当存在 MiMo 密钥时追加。
    """
    config = config or {}
    keys = keys if keys is not None else find_keys(config)
    entries = []
    for key, source in keys:
        entries.append((f"opencode-go({source})", OPENAI_CHAT_URL, key, "openai"))
    mimo_key = find_mimo_key(config)
    if mimo_key:
        base = config.get("mimoBaseUrl") or MIMO_ANTHROPIC_URL
        entries.append((f"mimo-native({base})", base, mimo_key, "anthropic"))
    if not entries:
        raise RuntimeError(
            "未找到任何 API key。请设置环境变量 OPENCODE_API_KEY，或确认 "
            "~/.local/share/opencode/auth.json / ~/.cc-switch/cc-switch.db 中存在 opencode 密钥。"
        )
    return entries


def recognize_with_failover(prompt, image_b64, mime, model=DEFAULT_MODEL, timeout_ms=180000, config=None, keys=None):
    """依次尝试各配置调用识图模型；返回 (result, usage, dt, used_label, switched, attempts)。"""
    entries = build_configs(model, config, keys)
    attempts = []
    for label, base_url, key, channel in entries:
        try:
            text, usage, dt = recognize_attempt(
                prompt, image_b64, mime, model, base_url, key, channel, timeout_ms)
            return text, usage, dt, label, len(attempts) > 0, attempts
        except Exception as e:
            attempts.append({"config": label, "ok": False, "error": str(e)})
    detail = "; ".join(f"{a['config']}: {a['error']}" for a in attempts)
    raise RuntimeError(f"所有 {len(entries)} 个识图配置均失败。{detail}")


def extract_json_array(text):
    """从返回文本里抽取第一个 [...] 并解析为 JSON 数组；失败返回 None。"""
    m = re.search(r"\[.*\]", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def usage_line(usage, model=DEFAULT_MODEL, dt=0.0):
    i = usage.get("input_tokens", 0)
    o = usage.get("output_tokens", 0)
    pi, po = PRICE.get(model, PRICE[DEFAULT_MODEL])
    est = i * pi / 1e6 + o * po / 1e6
    return (f"# {model} | in={i} out={o} | {dt:.1f}s | ≈${est:.4f} "
            f"({i * pi / 1e6:.4f}+{o * po / 1e6:.4f})")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="opencode go 多模态识图助手（失败自动切换配置）")
    ap.add_argument("image", help="图片：本地路径 / URL / dataURI")
    ap.add_argument("prompt", nargs="?", default=None, help="提示词（默认：UI/文字识别+坐标）")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"模型（默认 {DEFAULT_MODEL}）")
    ap.add_argument("--json", action="store_true", help="只输出结构化 JSON（含 bbox 坐标）")
    ap.add_argument("--json-out", action="store_true",
                    help="stdout 输出单个 JSON 对象 {ok,text,model,config,switched,attempts,usage,elapsedMs}，供程序消费")
    ap.add_argument("--timeout", type=int, default=180, help="单次请求超时秒数（默认 180）")
    ap.add_argument("--config", default=None, help=f"配置 JSON 文件（默认 {USER_CONFIG}）")
    ap.add_argument("--verbose", action="store_true", help="stderr 打印每次尝试与用量")
    args = ap.parse_args()

    prompt = args.prompt or DEFAULT_PROMPT
    if args.json:
        prompt = JSON_PROMPT + prompt
    config = read_user_config(args.config)

    try:
        b64, mime = load_image(args.image)
        result, usage, dt, label, switched, attempts = recognize_with_failover(
            prompt, b64, mime, args.model, args.timeout * 1000, config)
    except FileNotFoundError as e:
        if args.json_out:
            print(json.dumps({"ok": False, "error": str(e), "attempts": []}, ensure_ascii=False))
        else:
            sys.exit(str(e))
        return
    except RuntimeError as e:
        if args.json_out:
            print(json.dumps({"ok": False, "error": str(e), "attempts": attempts
                              if "attempts" in locals() else []}, ensure_ascii=False))
        else:
            sys.exit(str(e))
        return

    if args.json_out:
        print(json.dumps({
            "ok": True,
            "text": result,
            "model": args.model,
            "config": label,
            "switched": switched,
            "attempts": attempts,
            "usage": {
                "inputTokens": usage.get("input_tokens", 0),
                "outputTokens": usage.get("output_tokens", 0),
            },
            "elapsedMs": int(dt * 1000),
        }, ensure_ascii=False))
        return

    if args.json:
        arr = extract_json_array(result)
        if arr is not None:
            print(json.dumps(arr, ensure_ascii=False, indent=1))
            print(usage_line(usage, args.model, dt), file=sys.stderr)
            return
    print(result)
    if args.verbose:
        print(f"# config={label} switched={switched}", file=sys.stderr)
    print(usage_line(usage, args.model, dt), file=sys.stderr)


if __name__ == "__main__":
    main()
