#!/usr/bin/env python3
"""GitView turns a local Git repository into a single-file HTML report."""

from __future__ import annotations

import argparse
import hashlib
import html
import re
import subprocess
import sys
import webbrowser
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

VERSION = "1.0.0"
FIELD = "\x00"
RECORD = "\x1e"

LANGUAGES = {
    ".c": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".go": "Go",
    ".h": "C header",
    ".hpp": "C++ header",
    ".html": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".json": "JSON",
    ".jsx": "React",
    ".kt": "Kotlin",
    ".lua": "Lua",
    ".md": "Markdown",
    ".php": "PHP",
    ".py": "Python",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".scss": "SCSS",
    ".sh": "Shell",
    ".sql": "SQL",
    ".swift": "Swift",
    ".toml": "TOML",
    ".ts": "TypeScript",
    ".tsx": "React",
    ".txt": "Text",
    ".vue": "Vue",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
}


class GitViewError(Exception):
    pass


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def git(repo: Path, *args: str) -> str:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError as exc:
        raise GitViewError("git is not installed or is not on PATH") from exc
    if proc.returncode != 0:
        message = proc.stderr.strip() or proc.stdout.strip() or "git command failed"
        raise GitViewError(message)
    return proc.stdout


def find_repo(value: str) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.exists():
        raise GitViewError(f"path does not exist: {candidate}")
    if candidate.is_file():
        candidate = candidate.parent
    try:
        inside = git(candidate, "rev-parse", "--is-inside-work-tree").strip()
        if inside == "true":
            return Path(git(candidate, "rev-parse", "--show-toplevel").strip())
        bare = git(candidate, "rev-parse", "--is-bare-repository").strip()
        if bare == "true":
            return Path(git(candidate, "rev-parse", "--absolute-git-dir").strip())
    except GitViewError as exc:
        text = str(exc).lower()
        if "not a git repository" in text or "not a git dir" in text:
            raise GitViewError(f"not a git repository: {candidate}") from exc
        raise
    raise GitViewError(f"not a git repository: {candidate}")


def clean_markdown_line(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = text.replace("`", "").replace("**", "").replace("__", "")
    text = re.sub(r"(?<!\w)[*_](\S.*?\S)[*_](?!\w)", r"\1", text)
    text = html.unescape(text)
    return " ".join(text.split())


def truncate(text: str, limit: int) -> str:
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    clipped = text[: limit - 1].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped.rstrip(" ,.;:") + "…"


def read_description(root: Path) -> str:
    candidates = (
        "README.md",
        "README.markdown",
        "README.rst",
        "README.txt",
        "README",
        "readme.md",
    )
    for name in candidates:
        path = root / name
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        heading = ""
        in_fence = False
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if line.startswith(("```", "~~~")):
                in_fence = not in_fence
                continue
            if in_fence or not line:
                continue
            if line.startswith("#"):
                if not heading:
                    heading = clean_markdown_line(line.lstrip("#").strip())
                continue
            if line.startswith(("---", "===", "[![", "![", "<img", "<p", "<div", "|", "<!--")):
                continue
            if line.startswith(">"):
                line = line.lstrip(">").strip()
            cleaned = clean_markdown_line(line)
            if cleaned and not cleaned.lower().startswith(("table of contents", "contents")):
                return truncate(cleaned, 240)
        if heading and not heading.lower().startswith(("table of contents", "contents")):
            return truncate(heading, 240)
    try:
        git_dir = Path(git(root, "rev-parse", "--absolute-git-dir").strip())
        description = (git_dir / "description").read_text(
            encoding="utf-8", errors="replace"
        ).strip()
        if description and not description.lower().startswith("unnamed repository"):
            return truncate(description, 240)
    except (OSError, GitViewError):
        pass
    return "A local Git repository visualized with GitView."


def current_branch(root: Path) -> str:
    try:
        branch = git(root, "symbolic-ref", "--short", "-q", "HEAD").strip()
        if branch:
            return branch
    except GitViewError:
        pass
    return "detached HEAD"


def safe_remote(url: str) -> str:
    if not url:
        return ""
    sanitized = re.sub(r"(https?://)[^/@\s]+@", r"\1", url.strip())
    return sanitized


def count_refs(root: Path, ref: str) -> int:
    try:
        output = git(root, "for-each-ref", "--format=%(refname)", ref)
    except GitViewError:
        return 0
    return len([line for line in output.splitlines() if line.strip()])


def load_commits(root: Path, rev: str, use_all: bool, limit: int | None) -> list[dict]:
    args = ["log"]
    args.append("--all" if use_all else rev)
    if limit:
        args.extend(["--max-count", str(limit)])
    args.extend(
        [
            "--date=iso-strict",
            "--pretty=format:"
            + "%x00".join(
                [
                    "%H",
                    "%h",
                    "%an",
                    "%ae",
                    "%aI",
                    "%cn",
                    "%ce",
                    "%P",
                    "%D",
                    "%s",
                    "%b",
                ]
            )
            + "%x1e",
        ]
    )
    try:
        raw = git(root, *args)
    except GitViewError:
        return []

    commits: list[dict] = []
    for record in raw.split(RECORD):
        record = record.strip("\n")
        if not record:
            continue
        fields = record.split(FIELD)
        if len(fields) < 11:
            continue
        try:
            when = datetime.fromisoformat(fields[4].replace("Z", "+00:00"))
        except ValueError:
            when = datetime.now(timezone.utc)
        refs = [item.strip() for item in fields[8].split(",") if item.strip()]
        commits.append(
            {
                "hash": fields[0],
                "short": fields[1],
                "author": fields[2] or "Unknown",
                "email": fields[3],
                "when": when,
                "committer": fields[5],
                "committer_email": fields[6],
                "parents": fields[7].split(),
                "refs": refs,
                "subject": fields[9].strip() or "(no subject)",
                "body": fields[10].strip(),
                "files": [],
                "additions": 0,
                "deletions": 0,
            }
        )
    return commits


def load_stats(
    root: Path, rev: str, use_all: bool, limit: int | None
) -> dict[str, list[dict]]:
    args = ["-c", "core.quotepath=false", "log"]
    args.append("--all" if use_all else rev)
    if limit:
        args.extend(["--max-count", str(limit)])
    args.extend(["--numstat", "--pretty=format:@@@%H"])
    try:
        raw = git(root, *args)
    except GitViewError:
        return {}

    stats: dict[str, list[dict]] = {}
    current: str | None = None
    for line in raw.splitlines():
        if line.startswith("@@@"):
            current = line[3:].strip()
            stats[current] = []
            continue
        if not current or not line.strip():
            continue
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        added, deleted, path = parts
        binary = added == "-" or deleted == "-"
        try:
            add_count = 0 if binary else int(added)
        except ValueError:
            add_count = 0
        try:
            del_count = 0 if binary else int(deleted)
        except ValueError:
            del_count = 0
        stats[current].append(
            {
                "path": path,
                "add": add_count,
                "del": del_count,
                "binary": binary,
            }
        )
    return stats


def attach_stats(commits: list[dict], stats: dict[str, list[dict]]) -> None:
    for commit in commits:
        files = stats.get(commit["hash"], [])
        commit["files"] = files
        commit["additions"] = sum(item["add"] for item in files)
        commit["deletions"] = sum(item["del"] for item in files)


def load_tree(root: Path, rev: str) -> tuple[dict, list[dict]]:
    tree: dict = {"name": "", "type": "dir", "children": {}, "files": 0}
    files: list[dict] = []
    try:
        raw = git(root, "-c", "core.quotepath=false", "ls-tree", "-r", "-l", rev)
    except GitViewError:
        return tree, files

    for line in raw.splitlines():
        meta, separator, path = line.partition("\t")
        if not separator or not path:
            continue
        parts = meta.split()
        if len(parts) < 4:
            continue
        try:
            size = None if parts[3] == "-" else int(parts[3])
        except ValueError:
            size = None
        extension = Path(path).suffix.lower()
        files.append(
            {
                "path": path,
                "size": size,
                "ext": extension,
            }
        )
        segments = path.split("/")
        cursor = tree
        cursor["files"] += 1
        for segment in segments[:-1]:
            child = cursor["children"].get(segment)
            if not child or child["type"] != "dir":
                child = {"name": segment, "type": "dir", "children": {}, "files": 0}
                cursor["children"][segment] = child
            child["files"] += 1
            cursor = child
        cursor["children"][segments[-1]] = {
            "name": segments[-1],
            "type": "file",
            "path": path,
            "size": size,
            "ext": extension,
        }
    return tree, files


def human_size(size: int | None) -> str:
    if size is None:
        return ""
    value = float(size)
    if value < 1024:
        return f"{int(value)} B"
    for unit in ("KB", "MB", "GB", "TB"):
        value /= 1024
        if value < 1024:
            if value < 10:
                return f"{value:.1f} {unit}"
            return f"{value:.0f} {unit}"
    return f"{value:.1f} PB"


def hue_for(text: str) -> int:
    digest = hashlib.sha1(text.encode("utf-8", errors="replace")).hexdigest()
    return int(digest[:8], 16) % 360


def initials(name: str) -> str:
    parts = [part for part in re.split(r"\s+", name.strip()) if part]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def relative_time(when: datetime) -> str:
    now = datetime.now(when.tzinfo or timezone.utc)
    delta = now - when
    seconds = int(delta.total_seconds())
    if seconds < 0:
        return "in the future"
    if seconds < 90:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    if days == 1:
        return "yesterday"
    if days < 30:
        return f"{days} days ago"
    months = days // 30
    if months < 12:
        return f"{months} month{'s' if months != 1 else ''} ago"
    years = days // 365
    return f"{years} year{'s' if years != 1 else ''} ago"


def type_name(extension: str) -> str:
    if not extension:
        return "No extension"
    return LANGUAGES.get(extension, extension.lstrip(".").upper())


def render_ref_badges(refs: list[str]) -> str:
    badges: list[str] = []
    for ref in refs:
        if ref.startswith("HEAD ->"):
            label = ref.replace("HEAD ->", "HEAD →", 1).strip()
            css = "badge-head"
        elif ref.startswith("tag:"):
            label = ref[4:].strip()
            css = "badge-tag"
        elif "/" in ref:
            label = ref
            css = "badge-remote"
        else:
            label = ref
            css = "badge-branch"
        badges.append(f'<span class="badge {css}">{esc(label)}</span>')
    return "".join(badges)


def render_commit_files(files: list[dict], additions: int, deletions: int) -> str:
    if not files:
        return ""
    rows: list[str] = []
    for item in files:
        add_count = item["add"]
        del_count = item["del"]
        total = add_count + del_count
        add_pct = (add_count / total * 100) if total else 0
        del_pct = (del_count / total * 100) if total else 0
        hue = hue_for(Path(item["path"]).suffix.lower() or item["path"])
        if item["binary"]:
            counts = '<span class="binary-label">binary</span>'
            bars = ""
        else:
            counts = (
                f'<span class="add">+{add_count:,}</span> '
                f'<span class="del">−{del_count:,}</span>'
            )
            bars = (
                '<span class="mini-bars" aria-hidden="true">'
                f'<span class="mini-add" style="width:{add_pct:.1f}%"></span>'
                f'<span class="mini-del" style="width:{del_pct:.1f}%"></span>'
                "</span>"
            )
        rows.append(
            '<div class="commit-file">'
            f'<span class="file-dot" style="--hue:{hue}"></span>'
            f'<span class="commit-file-path" title="{esc(item["path"])}">{esc(item["path"])}</span>'
            f'<span class="commit-file-counts">{counts}</span>'
            f"{bars}"
            "</div>"
        )
    file_word = "file" if len(files) == 1 else "files"
    return (
        '<details class="commit-files">'
        "<summary>"
        f'<span class="details-chevron" aria-hidden="true"></span>'
        f"<span>{len(files):,} {file_word} changed</span>"
        f'<span class="summary-add">+{additions:,}</span>'
        f'<span class="summary-del">−{deletions:,}</span>'
        "</summary>"
        f'<div class="file-list">{"".join(rows)}</div>'
        "</details>"
    )


def render_commit(commit: dict) -> str:
    when: datetime = commit["when"]
    hue = hue_for(commit["author"])
    badges = render_ref_badges(commit["refs"])
    if len(commit["parents"]) > 1:
        badges += '<span class="badge badge-merge">merge</span>'
    body = ""
    if commit["body"]:
        body = f'<div class="commit-body">{esc(commit["body"])}</div>'
    search_blob = " ".join(
        [
            commit["subject"],
            commit["author"],
            commit["email"],
            commit["hash"],
            commit["short"],
            commit["body"],
            *[item["path"] for item in commit["files"]],
        ]
    ).replace("\n", " ")
    file_summary = ""
    if commit["files"]:
        file_summary = (
            f'<span>{len(commit["files"]):,} file'
            f'{"s" if len(commit["files"]) != 1 else ""}</span>'
            f'<span class="add">+{commit["additions"]:,}</span>'
            f'<span class="del">−{commit["deletions"]:,}</span>'
        )
    elif len(commit["parents"]) > 1:
        file_summary = "<span>Merge commit</span>"
    else:
        file_summary = "<span>No file changes recorded</span>"

    return (
        f'<article class="commit" data-search="{esc(search_blob)}">'
        '<div class="commit-card">'
        '<div class="commit-head">'
        f'<div class="avatar" style="--hue:{hue}" title="{esc(commit["author"])}">'
        f"{esc(initials(commit['author']))}</div>"
        '<div class="commit-main">'
        '<div class="commit-top">'
        f'<span class="author" title="{esc(commit["email"])}">{esc(commit["author"])}</span>'
        f'<time datetime="{esc(when.isoformat())}" title="{esc(when.isoformat())}">'
        f'{esc(when.strftime("%b %d, %Y · %H:%M"))}'
        f'<span class="relative"> · {esc(relative_time(when))}</span></time>'
        f'<button class="hash" type="button" data-hash="{esc(commit["hash"])}" '
        f'title="Copy full commit hash">{esc(commit["short"])}</button>'
        "</div>"
        f'<h3 class="subject">{esc(commit["subject"])}</h3>'
        f'{body}'
        f'<div class="badges">{badges}</div>'
        f'<div class="commit-meta">{file_summary}</div>'
        f'{render_commit_files(commit["files"], commit["additions"], commit["deletions"])}'
        "</div>"
        "</div>"
        "</div>"
        "</article>"
    )


def month_start(moment: datetime) -> datetime:
    return datetime(moment.year, moment.month, 1)


def add_months(moment: datetime, amount: int) -> datetime:
    index = moment.year * 12 + (moment.month - 1) + amount
    return datetime(index // 12, index % 12 + 1, 1)


def render_activity(commits: list[dict]) -> str:
    if not commits:
        return '<p class="empty-inline">No commits to chart yet.</p>'
    months = Counter(commit["when"].strftime("%Y-%m") for commit in commits)
    peak = max(months.values())
    earliest = month_start(min(commit["when"] for commit in commits))
    latest = month_start(max(commit["when"] for commit in commits))
    start = min(earliest, add_months(latest, -5))
    series: list[tuple[datetime, int]] = []
    cursor = start
    while cursor <= latest:
        series.append((cursor, months.get(cursor.strftime("%Y-%m"), 0)))
        cursor = add_months(cursor, 1)
    label_step = max(1, (len(series) + 11) // 12)
    columns: list[str] = []
    for index, (moment, count) in enumerate(series):
        height = max(4, round(count / peak * 100)) if count else 0
        label = ""
        if len(series) <= 18 or index % label_step == 0 or index == len(series) - 1:
            label = moment.strftime("%b")
        if moment.month == 1:
            label = moment.strftime("%b '%y")
        title = (
            f"{moment.strftime('%B %Y')} · "
            + (f"{count:,} commit{'s' if count != 1 else ''}" if count else "no commits")
        )
        bar = f'<span class="bar" style="height:{height}%"></span>' if count else ""
        columns.append(
            f'<div class="bar-col" title="{esc(title)}">'
            f'<div class="bar-track">{bar}</div>'
            f'<span class="bar-label">{esc(label)}</span>'
            "</div>"
        )
    return f'<div class="chart-scroll"><div class="chart">{"".join(columns)}</div></div>'


def render_contributors(commits: list[dict]) -> str:
    if not commits:
        return '<p class="empty-inline">No contributors yet.</p>'
    counts = Counter(commit["author"] for commit in commits)
    top = counts.most_common(7)
    peak = top[0][1] or 1
    rows: list[str] = []
    for name, count in top:
        hue = hue_for(name)
        width = max(3, round(count / peak * 100))
        rows.append(
            '<div class="contributor">'
            f'<span class="avatar avatar-sm" style="--hue:{hue}">{esc(initials(name))}</span>'
            '<span class="contributor-main">'
            f'<span class="contributor-name" title="{esc(name)}">{esc(name)}</span>'
            f'<span class="contributor-bar"><span style="width:{width}%"></span></span>'
            "</span>"
            f'<span class="contributor-count">{count:,}</span>'
            "</div>"
        )
    return "".join(rows)


def render_file_types(files: list[dict]) -> str:
    if not files:
        return '<p class="empty-inline">No tracked files yet.</p>'
    counts = Counter(type_name(item["ext"]) for item in files)
    top = counts.most_common(6)
    peak = top[0][1] or 1
    rows: list[str] = []
    for name, count in top:
        hue = hue_for(name)
        width = max(3, round(count / peak * 100))
        rows.append(
            '<div class="type-row">'
            f'<span class="file-dot" style="--hue:{hue}"></span>'
            f'<span class="type-name">{esc(name)}</span>'
            f'<span class="type-bar"><span style="width:{width}%"></span></span>'
            f'<span class="type-count">{count:,}</span>'
            "</div>"
        )
    return "".join(rows)


def render_tree(tree: dict, depth: int = 0) -> str:
    children = tree["children"]
    if not children:
        return '<p class="empty-inline">No tracked files yet.</p>'
    entries = sorted(
        children.values(),
        key=lambda node: (node["type"] != "dir", node["name"].lower()),
    )
    items: list[str] = []
    for node in entries:
        if node["type"] == "dir":
            file_word = "file" if node["files"] == 1 else "files"
            open_attr = " open" if depth < 1 else ""
            items.append(
                f'<li><details class="tree-dir"{open_attr}>'
                f'<summary title="{esc(node["name"])} · {node["files"]:,} {file_word}">'
                f'<span class="dir-name">{esc(node["name"])}</span>'
                f'<span class="dir-count">{node["files"]:,}</span>'
                "</summary>"
                f'{render_tree(node, depth + 1)}'
                "</details></li>"
            )
        else:
            hue = hue_for(node["ext"] or node["path"])
            size = human_size(node["size"])
            items.append(
                f'<li class="file-row" data-path="{esc(node["path"])}">'
                f'<span class="file-dot" style="--hue:{hue}"></span>'
                f'<span class="file-name" title="{esc(node["path"])}">{esc(node["name"])}</span>'
                f'<span class="file-size">{esc(size)}</span>'
                "</li>"
            )
    return f'<ul class="tree">{"".join(items)}</ul>'


def render_stats(
    commits: list[dict],
    files: list[dict],
    branches: int,
    tags: int,
    branch: str,
    use_all: bool,
) -> str:
    contributors = len({commit["author"] for commit in commits})
    additions = sum(commit["additions"] for commit in commits)
    deletions = sum(commit["deletions"] for commit in commits)
    total_size = sum(item["size"] or 0 for item in files)
    if commits:
        oldest = min(commit["when"] for commit in commits)
        newest = max(commit["when"] for commit in commits)
        span_days = max(1, (newest - oldest).days + 1)
        span = f"over {span_days:,} day{'s' if span_days != 1 else ''}"
    else:
        span = "no history yet"
    top_author = Counter(commit["author"] for commit in commits).most_common(1)
    top_note = f"top: {top_author[0][0]}" if top_author else "waiting for contributors"
    tag_note = f"{tags:,} release marker{'s' if tags != 1 else ''}" if tags else "no tags"
    branch_note = f"viewing {branch}" if not use_all else "all refs included"
    size_note = human_size(total_size) if total_size else "no files"
    changes = f'<span class="add">+{additions:,}</span> <span class="del">−{deletions:,}</span>'
    cards = [
        ("Commits", f"{len(commits):,}", span),
        ("Contributors", f"{contributors:,}", top_note),
        ("Tracked files", f"{len(files):,}", size_note),
        ("Branches", f"{branches:,}", branch_note),
        ("Tags", f"{tags:,}", tag_note),
        ("Lines changed", changes, "across displayed history"),
    ]
    rendered: list[str] = []
    for label, value, note in cards:
        small = ' small' if label == "Lines changed" else ""
        rendered.append(
            '<div class="stat">'
            f'<span class="stat-label">{esc(label)}</span>'
            f'<span class="stat-value{small}">{value}</span>'
            f'<span class="stat-note">{esc(note)}</span>'
            "</div>"
        )
    return "".join(rendered)


CSS = """
*{box-sizing:border-box}
:root{
  color-scheme:dark;
  --bg:#070b12;
  --bg-2:#0c1320;
  --panel:rgba(16,24,38,.74);
  --panel-solid:#101826;
  --border:#1d2a3e;
  --border-strong:#2b3d57;
  --text:#e7eef9;
  --muted:#8b9bb4;
  --faint:#607391;
  --accent:#5b9dff;
  --accent-2:#8b5cf6;
  --green:#3fb950;
  --green-soft:rgba(63,185,80,.14);
  --red:#f85149;
  --red-soft:rgba(248,81,73,.14);
  --amber:#e3b341;
  --shadow:0 24px 70px rgba(0,0,0,.38);
  --radius:16px;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
}
:root[data-theme="light"]{
  color-scheme:light;
  --bg:#f4f7fb;
  --bg-2:#eaf0f8;
  --panel:rgba(255,255,255,.82);
  --panel-solid:#ffffff;
  --border:#dde6f1;
  --border-strong:#c7d4e5;
  --text:#0f1b2d;
  --muted:#5b6b84;
  --faint:#8393aa;
  --accent:#1f6feb;
  --accent-2:#7c3aed;
  --green:#1a7f37;
  --green-soft:rgba(26,127,55,.1);
  --red:#cf222e;
  --red-soft:rgba(207,34,46,.1);
  --amber:#9a6700;
  --shadow:0 20px 55px rgba(31,50,80,.1);
}
html{scroll-behavior:smooth}
body{
  margin:0;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  background:
    radial-gradient(1100px 680px at 82% -12%,rgba(91,157,255,.16),transparent 62%),
    radial-gradient(900px 620px at -5% 0%,rgba(139,92,246,.13),transparent 58%),
    var(--bg);
  color:var(--text);
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
[hidden]{display:none!important}
.add{color:var(--green)}
.del{color:var(--red)}
code,.mono{font-family:var(--mono)}
.topbar{
  max-width:1440px;
  margin:0 auto;
  padding:20px 28px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
}
.brand{display:flex;align-items:center;gap:10px;font-weight:700}
.brand-mark{
  width:34px;height:34px;border-radius:10px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--accent),var(--accent-2));
  color:#fff;box-shadow:0 8px 24px rgba(91,157,255,.3);
}
.brand-mark svg{width:20px;height:20px}
.brand-name{font-size:15px;letter-spacing:.01em}
.brand-version{
  font-family:var(--mono);font-size:10.5px;color:var(--muted);
  border:1px solid var(--border);border-radius:999px;padding:1px 7px;
}
.topbar-actions{display:flex;align-items:center;gap:14px}
.generated{font-size:11.5px;color:var(--faint);font-family:var(--mono)}
.icon-btn{
  appearance:none;border:1px solid var(--border);background:var(--panel);
  color:var(--text);border-radius:9px;padding:6px 11px;font:inherit;font-size:11.5px;
  cursor:pointer;transition:border-color .15s,background .15s;
}
.icon-btn:hover{border-color:var(--border-strong);background:var(--bg-2)}
.page{max-width:1440px;margin:0 auto;padding:6px 28px 80px}
.hero{padding:26px 0 22px}
.eyebrow{
  display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:650;
  letter-spacing:.13em;text-transform:uppercase;color:var(--accent);margin-bottom:12px;
}
.eyebrow .live-dot{
  width:6px;height:6px;border-radius:50%;background:var(--green);
  box-shadow:0 0 0 4px rgba(63,185,80,.14);
}
.hero h1{
  margin:0 0 12px;font-size:clamp(2.2rem,4.2vw,3.7rem);line-height:1.05;
  letter-spacing:-.035em;font-weight:750;
  background:linear-gradient(115deg,var(--text) 20%,var(--accent) 82%,var(--accent-2));
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
}
.description{max-width:820px;margin:0 0 18px;color:var(--muted);font-size:15px}
.meta{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}
.meta-item{
  display:inline-flex;align-items:center;gap:7px;max-width:100%;
  border:1px solid var(--border);background:var(--panel);border-radius:999px;
  padding:4px 11px;font-family:var(--mono);font-size:11px;color:var(--muted);
}
.meta-item svg{width:13px;height:13px;flex:none;color:var(--faint)}
.meta-item.path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stats{
  display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:8px 0 20px;
}
.stat{
  position:relative;background:var(--panel);border:1px solid var(--border);
  border-radius:14px;padding:14px 15px 13px;overflow:hidden;
  transition:border-color .15s,transform .15s;
}
.stat::after{
  content:"";position:absolute;inset:0 0 auto;height:1px;
  background:linear-gradient(90deg,transparent,rgba(91,157,255,.45),transparent);
}
.stat:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.stat-label{display:block;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);font-weight:600}
.stat-value{display:block;font-size:23px;font-weight:700;letter-spacing:-.02em;margin:4px 0 2px;font-variant-numeric:tabular-nums}
.stat-value.small{font-size:18px}
.stat-note{display:block;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.panel{
  background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);
  padding:16px 17px;box-shadow:0 1px 0 rgba(255,255,255,.03) inset;
}
.activity-panel{margin-bottom:22px}
.panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.panel-head h2{margin:0;font-size:13px;font-weight:650;letter-spacing:.01em}
.panel-head .panel-note{font-size:10.5px;color:var(--faint);font-family:var(--mono)}
.chart-scroll{overflow-x:auto;padding-bottom:3px}
.chart{display:flex;align-items:stretch;justify-content:space-around;gap:5px;height:118px;min-width:100%}
.bar-col{
  flex:1 1 0;min-width:14px;max-width:96px;display:flex;flex-direction:column;
  justify-content:flex-end;align-items:center;height:100%;gap:5px;
}
.bar-track{width:100%;flex:1;display:flex;align-items:flex-end;border-radius:4px}
.bar{
  display:block;width:100%;min-height:3px;border-radius:4px 4px 2px 2px;
  background:linear-gradient(180deg,var(--accent),rgba(91,157,255,.32));
  transition:filter .15s;
}
.bar-col:hover .bar{filter:brightness(1.3)}
.bar-label{
  height:12px;font-family:var(--mono);font-size:9px;color:var(--faint);
  white-space:nowrap;overflow:visible;
}
.layout{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:22px;align-items:start}
.sidebar{
  display:grid;gap:16px;position:sticky;top:16px;
  max-height:calc(100vh - 32px);overflow:auto;padding-right:3px;
}
.sidebar::-webkit-scrollbar,.chart-scroll::-webkit-scrollbar,.commit-body::-webkit-scrollbar{width:8px;height:8px}
.sidebar::-webkit-scrollbar-thumb,.chart-scroll::-webkit-scrollbar-thumb,.commit-body::-webkit-scrollbar-thumb{
  background:var(--border-strong);border-radius:99px;
}
.sidebar::-webkit-scrollbar-track,.chart-scroll::-webkit-scrollbar-track,.commit-body::-webkit-scrollbar-track{background:transparent}
.side-title{margin:0 0 12px;font-size:13px;font-weight:650}
.side-sub{font-size:10.5px;color:var(--faint);font-family:var(--mono)}
.contributor{display:flex;align-items:center;gap:10px;padding:5px 0}
.avatar{
  width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;
  font-size:11.5px;font-weight:700;color:#fff;letter-spacing:.02em;
  background:linear-gradient(135deg,hsl(var(--hue) 62% 34%),hsl(var(--hue) 55% 22%));
  border:1px solid hsl(var(--hue) 52% 46% / .35);
}
.avatar-sm{width:26px;height:26px;border-radius:8px;font-size:10px}
.contributor-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.contributor-name{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.contributor-bar{height:4px;border-radius:99px;background:var(--bg-2);overflow:hidden}
.contributor-bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-2))}
.contributor-count{font-family:var(--mono);font-size:10.5px;color:var(--muted)}
.type-row{display:grid;grid-template-columns:8px 1fr 52px 30px;align-items:center;gap:8px;padding:4px 0;font-size:11.5px}
.type-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.type-bar{height:4px;border-radius:99px;background:var(--bg-2);overflow:hidden}
.type-bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-2));opacity:.85}
.type-count{font-family:var(--mono);font-size:10px;color:var(--muted);text-align:right}
.file-dot{width:7px;height:7px;flex:none;border-radius:50%;background:hsl(var(--hue) 66% 56%);box-shadow:0 0 0 2px hsl(var(--hue) 66% 56% / .13)}
.files-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.files-head h2{margin:0;font-size:13px;font-weight:650}
.tree-actions{display:flex;gap:4px}
.tree-actions button{
  appearance:none;border:1px solid var(--border);background:transparent;color:var(--faint);
  font:inherit;font-size:10px;border-radius:6px;padding:2px 6px;cursor:pointer;
}
.tree-actions button:hover{color:var(--text);border-color:var(--border-strong)}
.tree-filter{
  width:100%;margin-bottom:10px;border:1px solid var(--border);background:var(--bg-2);
  color:var(--text);border-radius:8px;padding:6px 9px;font:inherit;font-size:11.5px;outline:none;
}
.tree-filter:focus{border-color:var(--accent)}
.tree{list-style:none;margin:0;padding:0;font-size:12px}
.tree .tree{padding-left:12px;margin-left:5px;border-left:1px solid var(--border)}
.tree>li{margin:0}
.tree-dir>summary{
  list-style:none;display:flex;align-items:center;gap:7px;cursor:pointer;
  padding:4px 6px;border-radius:6px;color:var(--text);user-select:none;
}
.tree-dir>summary::-webkit-details-marker{display:none}
.tree-dir>summary::before{
  content:"";width:0;height:0;flex:none;
  border-left:5px solid var(--faint);border-top:4px solid transparent;border-bottom:4px solid transparent;
  transition:transform .15s ease;transform-origin:30% 50%;
}
.tree-dir[open]>summary::before{transform:rotate(90deg)}
.tree-dir>summary:hover,.file-row:hover{background:var(--bg-2)}
.dir-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;font-weight:600}
.dir-count{margin-left:auto;font-family:var(--mono);font-size:9.5px;color:var(--faint)}
.file-row{display:flex;align-items:center;gap:7px;padding:3px 6px;border-radius:6px}
.file-name{
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:var(--mono);font-size:10.5px;color:var(--muted);
}
.file-size{margin-left:auto;flex:none;font-family:var(--mono);font-size:9px;color:var(--faint)}
.commits-section{min-width:0}
.commits-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.commits-head h2{margin:0;font-size:18px;letter-spacing:-.01em}
.commits-head p{margin:3px 0 0;font-size:11.5px;color:var(--muted);font-family:var(--mono)}
.search{
  display:flex;align-items:center;gap:8px;min-width:min(360px,100%);
  border:1px solid var(--border);background:var(--panel);border-radius:10px;
  padding:7px 10px;transition:border-color .15s;
}
.search:focus-within{border-color:var(--accent)}
.search svg{width:14px;height:14px;flex:none;color:var(--faint)}
.search input{
  flex:1;min-width:0;border:0;background:transparent;color:var(--text);
  font:inherit;font-size:12px;outline:none;
}
.search input::placeholder{color:var(--faint)}
.search kbd{
  border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;
  padding:0 5px;font-family:var(--mono);font-size:9.5px;color:var(--faint);
}
.timeline{position:relative;padding-left:24px;display:grid;gap:13px}
.timeline::before{
  content:"";position:absolute;left:7px;top:10px;bottom:10px;width:2px;
  background:linear-gradient(180deg,var(--border-strong),var(--border),transparent);
}
.commit{position:relative}
.commit::before{
  content:"";position:absolute;left:-21px;top:20px;width:9px;height:9px;border-radius:50%;
  background:var(--panel-solid);border:2px solid var(--accent);
  box-shadow:0 0 0 4px rgba(91,157,255,.13);z-index:1;
}
.commit-card{
  background:var(--panel);border:1px solid var(--border);border-radius:14px;
  padding:15px 17px;box-shadow:0 1px 0 rgba(255,255,255,.03) inset;
  transition:border-color .15s,transform .15s;backdrop-filter:blur(10px);
}
.commit-card:hover{border-color:var(--border-strong);transform:translateY(-1px)}
.commit-head{display:flex;align-items:flex-start;gap:12px}
.commit-main{flex:1;min-width:0}
.commit-top{display:flex;flex-wrap:wrap;align-items:center;gap:5px 11px;font-size:11.5px;color:var(--muted)}
.author{font-weight:650;color:var(--text);font-size:12.5px}
.commit-top time{font-family:var(--mono);font-size:10.5px;color:var(--faint)}
.relative{color:var(--faint)}
.hash{
  appearance:none;border:1px solid var(--border);background:var(--bg-2);color:var(--muted);
  font-family:var(--mono);font-size:10px;border-radius:5px;padding:1px 6px;
  cursor:pointer;transition:color .15s,border-color .15s;
}
.hash:hover{color:var(--accent);border-color:var(--accent)}
.subject{margin:7px 0 3px;font-size:15px;line-height:1.35;font-weight:660;letter-spacing:-.005em;overflow-wrap:anywhere}
.commit-body{
  margin:9px 0 4px;padding:8px 11px;border-left:2px solid var(--border-strong);
  background:var(--bg-2);border-radius:0 8px 8px 0;color:var(--muted);
  font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;overflow-wrap:anywhere;
  max-height:200px;overflow:auto;
}
.badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
.badges:empty{display:none}
.badge{
  display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;
  font-family:var(--mono);font-size:9.5px;line-height:1.7;border:1px solid transparent;
}
.badge-head{color:var(--accent);background:rgba(91,157,255,.12);border-color:rgba(91,157,255,.25)}
.badge-tag{color:var(--amber);background:rgba(227,179,65,.11);border-color:rgba(227,179,65,.25)}
.badge-branch{color:var(--green);background:var(--green-soft);border-color:rgba(63,185,80,.25)}
.badge-remote{color:var(--accent-2);background:rgba(139,92,246,.12);border-color:rgba(139,92,246,.25)}
.badge-merge{color:var(--muted);background:var(--bg-2);border-color:var(--border)}
.commit-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.commit-files{margin-top:9px;padding-top:8px;border-top:1px solid var(--border)}
.commit-files>summary{
  list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;
  font-size:11px;color:var(--muted);user-select:none;border-radius:6px;padding:2px 0;
}
.commit-files>summary::-webkit-details-marker{display:none}
.commit-files>summary:hover{color:var(--text)}
.details-chevron{
  width:0;height:0;flex:none;border-left:5px solid var(--faint);
  border-top:4px solid transparent;border-bottom:4px solid transparent;
  transition:transform .15s;transform-origin:30% 50%;
}
.commit-files[open] .details-chevron{transform:rotate(90deg)}
.summary-add{margin-left:auto;color:var(--green);font-family:var(--mono)}
.summary-del{color:var(--red);font-family:var(--mono)}
.file-list{margin-top:6px;display:grid;gap:1px;max-height:300px;overflow:auto}
.commit-file{display:flex;align-items:center;gap:8px;padding:2px 6px;border-radius:5px;font-size:10.5px}
.commit-file:hover{background:var(--bg-2)}
.commit-file-path{
  flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:var(--mono);color:var(--muted);
}
.commit-file-counts{flex:none;font-family:var(--mono);font-size:9.5px;font-variant-numeric:tabular-nums}
.binary-label{color:var(--faint)}
.mini-bars{display:flex;width:54px;height:5px;flex:none;border-radius:99px;overflow:hidden;background:var(--bg-2)}
.mini-add{background:var(--green);height:100%}
.mini-del{background:var(--red);height:100%}
.empty-inline{margin:0;font-size:11.5px;color:var(--faint)}
.empty{
  border:1px dashed var(--border-strong);border-radius:14px;padding:34px;
  text-align:center;color:var(--muted);font-size:13px;
}
.footer{
  max-width:1440px;margin:0 auto;padding:24px 28px 40px;border-top:1px solid var(--border);
  display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;
  font-family:var(--mono);font-size:10.5px;color:var(--faint);
}
.footer a{color:var(--muted)}
@media (max-width:1120px){
  .stats{grid-template-columns:repeat(3,minmax(0,1fr))}
  .layout{grid-template-columns:1fr}
  .sidebar{position:static;max-height:none;overflow:visible;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
  .files-panel{grid-column:1/-1}
}
@media (max-width:760px){
  .topbar,.page,.footer{padding-left:16px;padding-right:16px}
  .generated{display:none}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sidebar{grid-template-columns:1fr}
  .files-panel{grid-column:auto}
  .timeline{padding-left:19px}
  .commit::before{left:-16px}
  .commit-card{padding:13px 14px}
  .avatar{width:30px;height:30px;font-size:10.5px}
  .commit-file .mini-bars{display:none}
  .search{min-width:100%}
}
@media print{
  body{background:#fff;color:#111}
  .topbar-actions,.search,.tree-actions,.tree-filter{display:none}
  .sidebar{position:static;max-height:none}
  .commit-card,.panel,.stat{box-shadow:none}
}
"""

JS = """
(function(){
  const root=document.documentElement;
  const themeButton=document.getElementById('theme-toggle');
  function applyTheme(theme){
    root.dataset.theme=theme;
    if(themeButton){themeButton.textContent=theme==='dark'?'Light mode':'Dark mode';}
  }
  let saved='dark';
  try{saved=localStorage.getItem('gitview-theme')||'dark';}catch(e){}
  applyTheme(saved);
  if(themeButton){
    themeButton.addEventListener('click',function(){
      const next=root.dataset.theme==='dark'?'light':'dark';
      applyTheme(next);
      try{localStorage.setItem('gitview-theme',next);}catch(e){}
    });
  }

  const search=document.getElementById('commit-search');
  const count=document.getElementById('commit-count');
  const noResults=document.getElementById('no-results');
  const cards=Array.prototype.slice.call(document.querySelectorAll('.commit'));
  function emptyCount(){
    if(!count)return;
    count.textContent=cards.length+(cards.length===1?' commit':' commits');
  }
  function filterCommits(){
    if(!search)return;
    const query=search.value.trim().toLowerCase();
    let shown=0;
    cards.forEach(function(card){
      const haystack=(card.dataset.search||'').toLowerCase();
      const match=!query||haystack.indexOf(query)!==-1;
      card.hidden=!match;
      if(match)shown++;
    });
    if(count){
      count.textContent=query
        ? shown+' of '+cards.length+(cards.length===1?' commit':' commits')
        : cards.length+(cards.length===1?' commit':' commits');
    }
    if(noResults)noResults.hidden=shown!==0;
  }
  if(search){
    search.addEventListener('input',filterCommits);
    emptyCount();
  }
  document.addEventListener('keydown',function(event){
    const tag=(document.activeElement&&document.activeElement.tagName)||'';
    if(event.key==='/'&&tag!=='INPUT'&&tag!=='TEXTAREA'&&search){
      event.preventDefault();
      search.focus();
      search.select();
    }
    if(event.key==='Escape'&&search){
      if(search.value){search.value='';filterCommits();}
      search.blur();
    }
  });

  const treeFilter=document.getElementById('tree-filter');
  const fileRows=Array.prototype.slice.call(document.querySelectorAll('.file-row'));
  const treeDirs=Array.prototype.slice.call(document.querySelectorAll('details.tree-dir'));
  function filterTree(){
    if(!treeFilter)return;
    const query=treeFilter.value.trim().toLowerCase();
    fileRows.forEach(function(row){
      const path=(row.dataset.path||'').toLowerCase();
      row.hidden=!!query&&path.indexOf(query)===-1;
    });
    treeDirs.slice().reverse().forEach(function(dir){
      const anyVisible=Array.prototype.some.call(
        dir.querySelectorAll('.file-row'),
        function(row){return !row.hidden;}
      );
      dir.hidden=!!query&&!anyVisible;
      if(query&&anyVisible)dir.open=true;
    });
  }
  if(treeFilter)treeFilter.addEventListener('input',filterTree);
  const expand=document.getElementById('tree-expand');
  const collapse=document.getElementById('tree-collapse');
  if(expand){expand.addEventListener('click',function(){treeDirs.forEach(function(dir){dir.open=true;});});}
  if(collapse){collapse.addEventListener('click',function(){treeDirs.forEach(function(dir){dir.open=false;});});}

  function copyText(text){
    if(navigator.clipboard&&window.isSecureContext){return navigator.clipboard.writeText(text);}
    return new Promise(function(resolve,reject){
      const area=document.createElement('textarea');
      area.value=text;area.style.position='fixed';area.style.opacity='0';
      document.body.appendChild(area);area.focus();area.select();
      let ok=false;
      try{ok=document.execCommand('copy');}catch(e){ok=false;}
      document.body.removeChild(area);
      ok?resolve():reject(new Error('copy failed'));
    });
  }
  document.addEventListener('click',function(event){
    const button=event.target.closest?event.target.closest('.hash'):null;
    if(!button)return;
    const hash=button.dataset.hash||'';
    const original=button.textContent;
    copyText(hash).then(function(){
      button.textContent='copied';
      setTimeout(function(){button.textContent=original;},1100);
    }).catch(function(){
      button.textContent='select & copy';
      setTimeout(function(){button.textContent=original;},1400);
    });
  });
})();
"""

HTML_START = """<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="GitView __VERSION__">
<meta name="color-scheme" content="dark light">
<title>__TITLE__ · GitView</title>
<script>try{var t=localStorage.getItem('gitview-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<style>__CSS__</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="5" r="2.1"></circle>
        <circle cx="6" cy="19" r="2.1"></circle>
        <circle cx="18" cy="12" r="2.1"></circle>
        <path d="M6 7.1v9.8"></path>
        <path d="M8.1 12h4.4c3.4 0 3.4-4.9 3.4-4.9"></path>
      </svg>
    </span>
    <span class="brand-name">GitView</span>
    <span class="brand-version">v__VERSION__</span>
  </div>
  <div class="topbar-actions">
    <span class="generated">generated __GENERATED__</span>
    <button class="icon-btn" id="theme-toggle" type="button">Light mode</button>
  </div>
</header>
<main class="page">
  <section class="hero">
    <div class="eyebrow"><span class="live-dot"></span> Repository report</div>
    <h1>__NAME__</h1>
    <p class="description">__DESCRIPTION__</p>
    <div class="meta">
      <span class="meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="5" r="2"></circle><circle cx="6" cy="19" r="2"></circle><circle cx="18" cy="12" r="2"></circle><path d="M6 7v10M8 12h4c3 0 4-2 4-5"></path></svg>
        __BRANCH__
      </span>
      <span class="meta-item path" title="__ROOT__">__ROOT__</span>
      __REMOTE__
    </div>
  </section>
  <section class="stats" aria-label="Repository statistics">__STATS__</section>
  <section class="panel activity-panel">
    <div class="panel-head">
      <h2>Commit activity</h2>
      <span class="panel-note">__ACTIVITY_NOTE__</span>
    </div>
    __ACTIVITY__
  </section>
  <div class="layout">
    <aside class="sidebar">
      <section class="panel">
        <div class="panel-head"><h2 class="side-title">Top contributors</h2><span class="side-sub">__CONTRIBUTOR_COUNT__</span></div>
        __CONTRIBUTORS__
      </section>
      <section class="panel">
        <div class="panel-head"><h2 class="side-title">File types</h2><span class="side-sub">BY COUNT</span></div>
        __FILE_TYPES__
      </section>
      <section class="panel files-panel">
        <div class="files-head">
          <h2>Files</h2>
          <div class="tree-actions">
            <button type="button" id="tree-expand">Expand</button>
            <button type="button" id="tree-collapse">Collapse</button>
          </div>
        </div>
        <input class="tree-filter" id="tree-filter" type="search" placeholder="Filter files…" autocomplete="off" aria-label="Filter files">
        __TREE__
      </section>
    </aside>
    <section class="commits-section">
      <div class="commits-head">
        <div>
          <h2>Commit history</h2>
          <p id="commit-count">__COMMIT_COUNT__</p>
        </div>
        <label class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
          <input id="commit-search" type="search" placeholder="Search commits, authors, files…" autocomplete="off" aria-label="Search commits">
          <kbd>/</kbd>
        </label>
      </div>
      <div class="timeline" id="timeline">__COMMITS__</div>
      <div class="empty" id="no-results" hidden>No commits match your search.</div>
    </section>
  </div>
</main>
<footer class="footer">
  <span>GitView v__VERSION__ · single-file report</span>
  <span>__COMMIT_COUNT__ · generated __GENERATED__</span>
</footer>
<script>__JS__</script>
</body>
</html>
"""


def build_html(
    *,
    name: str,
    description: str,
    root: Path,
    branch: str,
    remote: str,
    commits: list[dict],
    files: list[dict],
    tree: dict,
    branches: int,
    tags: int,
    use_all: bool,
) -> str:
    generated = datetime.now().astimezone().strftime("%b %d, %Y %H:%M")
    if commits:
        months = Counter(commit["when"].strftime("%Y-%m") for commit in commits)
        activity_note = f"{len(months):,} month{'s' if len(months) != 1 else ''}"
    else:
        activity_note = "no activity"
    contributors = len({commit["author"] for commit in commits})
    contributor_count = f"{contributors:,} contributor{'s' if contributors != 1 else ''}"
    commit_count = f"{len(commits):,} commit{'s' if len(commits) != 1 else ''}"
    commits_html = (
        "".join(render_commit(commit) for commit in commits)
        if commits
        else '<div class="empty">This repository has no commits yet.</div>'
    )
    remote_html = ""
    if remote:
        if remote.startswith(("http://", "https://")):
            remote_html = (
                f'<a class="meta-item" href="{esc(remote)}" title="{esc(remote)}" '
                f'target="_blank" rel="noopener noreferrer">origin · {esc(truncate(remote, 70))}</a>'
            )
        else:
            remote_html = (
                f'<span class="meta-item" title="{esc(remote)}">origin · {esc(truncate(remote, 70))}</span>'
            )

    replacements = {
        "__VERSION__": VERSION,
        "__TITLE__": esc(name),
        "__NAME__": esc(name),
        "__DESCRIPTION__": esc(description),
        "__BRANCH__": esc(branch),
        "__ROOT__": esc(root),
        "__REMOTE__": remote_html,
        "__STATS__": render_stats(commits, files, branches, tags, branch, use_all),
        "__ACTIVITY_NOTE__": esc(activity_note),
        "__ACTIVITY__": render_activity(commits),
        "__CONTRIBUTOR_COUNT__": esc(contributor_count),
        "__CONTRIBUTORS__": render_contributors(commits),
        "__FILE_TYPES__": render_file_types(files),
        "__TREE__": render_tree(tree),
        "__COMMIT_COUNT__": esc(commit_count),
        "__COMMITS__": commits_html,
        "__GENERATED__": esc(generated),
        "__CSS__": CSS,
        "__JS__": JS,
    }
    pattern = re.compile("|".join(re.escape(token) for token in replacements))
    return pattern.sub(lambda match: replacements[match.group(0)], HTML_START)


def positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a positive integer") from exc
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="gitview",
        description="Visualize a local Git repository as a single, self-contained HTML file.",
    )
    parser.add_argument("repo", nargs="?", default=".", help="path to the Git repository (default: .)")
    parser.add_argument("-o", "--output", default="gitview.html", help="output HTML file, or - for stdout (default: gitview.html)")
    parser.add_argument("--title", help="override the repository display name")
    parser.add_argument("--rev", default="HEAD", help="revision to visualize (default: HEAD)")
    parser.add_argument("--all", action="store_true", help="include commits reachable from all refs")
    parser.add_argument("--max-commits", type=positive_int, metavar="N", help="limit the number of commits rendered")
    parser.add_argument("--no-open", action="store_true", help="do not open the report in a browser")
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        root = find_repo(args.repo)
        name = args.title or root.name or "repository"
        description = read_description(root)
        branch =         current_branch(root)
        try:
            remote = safe_remote(git(root, "config", "--get", "remote.origin.url").strip())
        except GitViewError:
            remote = ""
        if not args.all:
            try:
                git(root, "rev-parse", "--verify", "--quiet", args.rev)
            except GitViewError:
                try:
                    git(root, "rev-parse", "--verify", "--quiet", "HEAD")
                except GitViewError:
                    pass
                else:
                    raise GitViewError(f"unknown revision: {args.rev}")
        commits = load_commits(root, args.rev, args.all, args.max_commits)
        attach_stats(commits, load_stats(root, args.rev, args.all, args.max_commits))
        tree, files = load_tree(root, args.rev)
        branches = count_refs(root, "refs/heads/")
        tags = count_refs(root, "refs/tags/")
        report = build_html(
            name=name,
            description=description,
            root=root,
            branch=branch,
            remote=remote,
            commits=commits,
            files=files,
            tree=tree,
            branches=branches,
            tags=tags,
            use_all=args.all,
        )
    except GitViewError as exc:
        print(f"gitview: error: {exc}", file=sys.stderr)
        return 1

    if args.output == "-":
        sys.stdout.write(report)
        return 0

    output = Path(args.output).expanduser()
    if output.is_dir():
        output = output / "gitview.html"
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(report, encoding="utf-8")
    except OSError as exc:
        print(f"gitview: error: {exc}", file=sys.stderr)
        return 1

    print(f"GitView report written to {output}")
    if not args.no_open:
        try:
            webbrowser.open(output.resolve().as_uri())
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
