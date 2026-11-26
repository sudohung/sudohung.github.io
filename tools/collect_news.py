#!/usr/bin/env python3
"""Collect daily news and render static HTML pages for the GitHub Pages site.

Output layout (inside the repo):
    news/index.html              -> list of all dates
    news/<YYYY-MM-DD>/index.html -> list of snapshots for that day
    news/<YYYY-MM-DD>/<HHMM>.html-> one snapshot per run

Usage:
    python3 tools/collect_news.py                 # collect + write pages
    python3 tools/collect_news.py --push          # also git add/commit/push
    python3 tools/collect_news.py --repo /path    # override repo root

No API keys required: uses public RSS feeds + the Hacker News API.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

CST = timezone(timedelta(hours=8))  # Asia/Shanghai (UTC+8, no DST)
UA = "Mozilla/5.0 (compatible; sudohung-news-bot/1.0; +https://blog.aiden-ng.top/)"

# name, type, url, per-source limit
SOURCES = [
    {"name": "爱范儿", "type": "rss", "url": "https://www.ifanr.com/feed", "limit": 6},
    {"name": "少数派", "type": "rss", "url": "https://sspai.com/feed", "limit": 6},
    {"name": "IT之家", "type": "rss", "url": "https://www.ithome.com/rss/", "limit": 6},
    {"name": "量子位", "type": "rss", "url": "https://www.qbitai.com/feed", "limit": 5},
    {"name": "Hacker News", "type": "hn", "limit": 8},
    {"name": "The Verge", "type": "rss", "url": "https://www.theverge.com/rss/index.xml", "limit": 5},
    {"name": "TechCrunch", "type": "rss", "url": "https://techcrunch.com/feed/", "limit": 5},
]

# 海外焦点（凌晨 3 点任务）：只采集国外 IT / 科技热点
FOREIGN_SOURCES = [
    {"name": "Hacker News", "type": "hn", "limit": 10},
    {"name": "The Verge", "type": "rss", "url": "https://www.theverge.com/rss/index.xml", "limit": 6},
    {"name": "Ars Technica", "type": "rss", "url": "https://feeds.arstechnica.com/arstechnica/index", "limit": 6},
    {"name": "Engadget", "type": "rss", "url": "https://www.engadget.com/rss.xml", "limit": 6},
    {"name": "InfoQ", "type": "rss", "url": "https://feed.infoq.com/", "limit": 5},
    {"name": "MIT Technology Review", "type": "rss", "url": "https://www.technologyreview.com/feed/", "limit": 5},
    {"name": "TechCrunch", "type": "rss", "url": "https://techcrunch.com/feed/", "limit": 5},
]

STYLE = """
:root{--accent:#ff7e5f;--accent2:#feb47b;}
*{box-sizing:border-box}
body{margin:0;font-family:'Roboto',-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;background:#f4f4f4;color:#333}
header{background:linear-gradient(to right,var(--accent),var(--accent2));color:#fff;padding:22px 0}
.container{width:86%;max-width:960px;margin:0 auto}
header h1{margin:0 0 6px;font-size:1.7em}
header .meta{opacity:.92;font-size:.9em}
a{color:#ff6c4c;text-decoration:none}
a:hover{text-decoration:underline}
main{padding:26px 0 50px}
.card{background:#fff;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,.08);padding:18px 20px;margin-bottom:18px}
.card h2{margin:0 0 12px;font-size:1.2em;display:flex;align-items:center;gap:8px}
.card h2 .tag{font-size:.7em;font-weight:600;color:#fff;background:var(--accent);padding:2px 8px;border-radius:999px}
ul.news{list-style:none;padding:0;margin:0}
ul.news li{padding:9px 0;border-bottom:1px solid #f0f0f0;line-height:1.5}
ul.news li:last-child{border-bottom:0}
ul.news .t{font-size:.78em;color:#999;margin-left:6px}
.crumb{margin-bottom:16px;font-size:.9em}
.empty{color:#999;text-align:center;padding:30px 0}
.date-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.date-list a{display:block;background:#fff;border-radius:8px;padding:16px;box-shadow:0 3px 8px rgba(0,0,0,.08);color:#333}
.date-list a span{color:#999;font-size:.8em;display:block}
footer{text-align:center;color:#999;font-size:.85em;padding:22px 0}
"""

PAGE_TPL = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{style}</style></head>
<body>
<header><div class="container"><h1>{h1}</h1><div class="meta">{meta}</div></div></header>
<main><div class="container">
{crumb}
{body}
</div></main>
<footer>&copy; {year} · 资讯自动采集</footer>
</body></html>
"""


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def clean(text):
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def _decode(data):
    for enc in ("utf-8", "gb18030", "latin-1"):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode("utf-8", "replace")


def _sanitize(text):
    # strip illegal XML control chars and escape bare ampersands
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);)", "&amp;", text)
    return text


def _regex_items(text, limit):
    """Tolerant fallback for malformed feeds."""
    items = re.findall(r"<item\b.*?</item>", text, re.S | re.I)
    if not items:
        items = re.findall(r"<entry\b.*?</entry>", text, re.S | re.I)
    out = []
    for block in items:
        tm = re.search(r"<title[^>]*>(.*?)</title>", block, re.S | re.I)
        lm = re.search(r"<link[^>]*>(.*?)</link>", block, re.S | re.I)
        link = ""
        if lm:
            link = re.sub(r"<!\[CDATA\[|\]\]>", "", lm.group(1)).strip()
        else:
            hm = re.search(r'<link[^>]*href="([^"]+)"', block, re.I)
            link = hm.group(1) if hm else ""
        title = ""
        if tm:
            title = clean(re.sub(r"<!\[CDATA\[|\]\]>", "", tm.group(1)))
        if title and link:
            out.append({"title": title, "link": link})
        if len(out) >= limit:
            break
    return out


def parse_rss(data, limit):
    text = _sanitize(_decode(data))
    try:
        root = ET.fromstring(text)
        out = []
        items = root.findall(".//item")
        is_atom = False
        if not items:
            items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
            is_atom = True
        for it in items[:limit]:
            if is_atom:
                t = it.find("{http://www.w3.org/2005/Atom}title")
                l = it.find("{http://www.w3.org/2005/Atom}link")
                link = l.get("href") if l is not None else ""
            else:
                t = it.find("title")
                l = it.find("link")
                link = clean(l.text) if l is not None else ""
            title = clean(t.text if t is not None else "")
            if title and link:
                out.append({"title": title, "link": link})
        if out:
            return out
    except Exception:
        pass
    return _regex_items(text, limit)


def collect_hn(limit):
    ids = json.loads(fetch("https://hacker-news.firebaseio.com/v0/topstories.json"))[:limit]
    out = []
    for i in ids:
        try:
            item = json.loads(fetch(f"https://hacker-news.firebaseio.com/v0/item/{i}.json"))
            title = item.get("title")
            url = item.get("url") or f"https://news.ycombinator.com/item?id={i}"
            if title:
                out.append({"title": title, "link": url})
        except Exception:
            continue
    return out


def collect(sources):
    result = []
    for src in sources:
        try:
            if src["type"] == "hn":
                items = collect_hn(src.get("limit", 8))
            else:
                items = parse_rss(fetch(src["url"]), src.get("limit", 6))
            if items:
                result.append({"name": src["name"], "items": items})
        except Exception as e:
            print(f"warn: source {src['name']} failed: {e}", file=sys.stderr)
    return result


def render_snapshot(date_str, time_str, sections, label="资讯快报"):
    parts = []
    for sec in sections:
        lis = "".join(
            f'<li><a href="{html.escape(i["link"], quote=True)}" target="_blank" rel="noreferrer">'
            f'{html.escape(i["title"])}</a></li>'
            for i in sec["items"]
        )
        parts.append(
            f'<div class="card"><h2><span class="tag">{html.escape(sec["name"])}</span></h2>'
            f'<ul class="news">{lis}</ul></div>'
        )
    if not parts:
        parts.append('<div class="card empty">本次未采集到资讯（新闻源暂不可用）。</div>')
    body = "\n".join(parts)
    return PAGE_TPL.format(
        title=f"{label} · {date_str} {time_str}",
        style=STYLE,
        h1=f"{label} · {date_str} {time_str}",
        meta=f"采集时间 {date_str} {time_str}（Asia/Shanghai）",
        crumb='<div class="crumb"><a href="../">← 返回当日列表</a> · <a href="../../">全部日期</a></div>',
        body=body,
        year=date_str[:4],
    )


def render_day(date_str, snaps):
    links = "".join(
        f'<div class="card"><a href="{s}.html">🕒 {s[:2]}:{s[2:]} 快照</a></div>' for s in snaps
    ) or '<div class="card empty">当日暂无快照。</div>'
    return PAGE_TPL.format(
        title=f"资讯 · {date_str}",
        style=STYLE,
        h1=f"{date_str} 资讯",
        meta=f"共 {len(snaps)} 份快照",
        crumb='<div class="crumb"><a href="../">← 全部日期</a></div>',
        body=links,
        year=date_str[:4],
    )


def render_index(dates):
    cards = "".join(
        f'<a href="{d}/"><strong>{d}</strong><span>查看当日资讯</span></a>' for d in dates
    ) or '<div class="card empty">还没有资讯，稍后自动采集。</div>'
    return PAGE_TPL.format(
        title="资讯",
        style=STYLE,
        h1="资讯",
        meta="每日 10:00 / 14:00 自动采集",
        crumb='<div class="crumb"><a href="../index.html">← 返回首页</a></div>',
        body=f'<div class="date-list">{cards}</div>',
        year=(dates[0][:4] if dates else datetime.now(CST).year),
    )


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


def rebuild_indexes(news_dir):
    dates = sorted(
        [d for d in os.listdir(news_dir) if re.match(r"^\d{4}-\d{2}-\d{2}$", d) and os.path.isdir(os.path.join(news_dir, d))],
        reverse=True,
    )
    write(os.path.join(news_dir, "index.html"), render_index(dates))
    for d in dates:
        dd = os.path.join(news_dir, d)
        snaps = sorted(
            f[:-5] for f in os.listdir(dd) if re.match(r"^\d{4}\.html$", f)
        )
        write(os.path.join(dd, "index.html"), render_day(d, snaps))
    return dates


def git_commit_push(repo, date_str, time_str):
    env = dict(os.environ)
    cmds = [
        ["git", "-C", repo, "add", "news"],
        ["git", "-C", repo, "commit", "-m", f"feat(资讯采集)：新增 {date_str} {time_str[:2]}:{time_str[2:]} 资讯快照"],
        ["git", "-C", repo, "push", "origin", "HEAD"],
    ]
    for c in cmds:
        r = subprocess.run(c, env=env, capture_output=True, text=True)
        if r.returncode != 0:
            # tolerate "nothing to commit"
            if c[3] == "commit" and "nothing to commit" in (r.stdout + r.stderr):
                print("no changes to commit")
                return
            print(f"git failed: {' '.join(c)}\n{r.stdout}\n{r.stderr}", file=sys.stderr)
            raise SystemExit(1)
    print("committed and pushed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--focus", choices=["all", "foreign"], default="all",
                    help="all=中英混合(默认)；foreign=仅海外 IT/科技热点")
    args = ap.parse_args()

    now = datetime.now(CST)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H%M")
    news_dir = os.path.join(args.repo, "news")

    sources = FOREIGN_SOURCES if args.focus == "foreign" else SOURCES
    label = "海外科技资讯快报" if args.focus == "foreign" else "资讯快报"

    print(f"collecting for {date_str} {time_str} (focus={args.focus}) ...")
    sections = collect(sources)
    total = sum(len(s["items"]) for s in sections)
    print(f"collected {total} items from {len(sections)} sources")

    write(os.path.join(news_dir, date_str, f"{time_str}.html"),
          render_snapshot(date_str, time_str, sections, label))
    rebuild_indexes(news_dir)
    print(f"wrote news/{date_str}/{time_str}.html and indexes")

    if args.push:
        git_commit_push(args.repo, date_str, time_str)


if __name__ == "__main__":
    main()
