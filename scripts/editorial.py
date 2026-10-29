"""Profile-driven screening using public title/summary metadata."""
import json
import re
from pathlib import Path

VERSION = 4
ROOT = Path(__file__).resolve().parents[1]

def load_profile(path=None):
    return json.loads(Path(path or ROOT / "profile.json").read_text(encoding="utf-8"))

def hits(pattern, value): return bool(re.search(pattern, value, re.I))
def any_terms(terms, value): return any(hits(re.escape(term), value) for term in terms)

def reading_experience(item, source):
    observed = {**source.get("readingExperience", {}), **item.get("readingExperience", {})}
    ad = max(0, min(3, int(observed.get("adDensity", 0))))
    obstruction, popups = observed.get("obstructive") is True, observed.get("frequentPopups") is True
    base = float(observed.get("baseScore", observed.get("score", .8)))
    factor = max(.15, min(1, base - .12 * ad - .25 * obstruction - .15 * popups))
    return {**observed, "baseScore": base, "score": round(factor, 2),
            "hint": "阅读体验一般 · 可尝试阅读模式" if ad >= 2 or obstruction or popups else "",
            "basis": observed.get("basis", "未完整实测排版，使用中性值")}

def chinese_video(item):
    access = item.get("viewingAccess", {})
    return access.get("mode") in ("zh-Hans", "zh-Hant", "auto-zh") and bool(access.get("evidenceUrl")) and bool(access.get("verifiedAt"))

def matched_groups(groups, raw):
    return [group["name"] for group in groups if any_terms(group["patterns"], raw)]

def assess(item, source, profile=None):
    profile = profile or load_profile()
    summary, title = item.get("excerpt", ""), item.get("title", "")
    missing = "来源定位" in item.get("excerptBasis", "") or not summary.strip() or hits(r"APOD\s*Science|APODArchive|CalendarRSS|To view this video please enable", summary)
    raw = title + " " + ("" if missing else summary) + " " + item.get("action", "")
    core, adjacent, wildcard = (matched_groups(profile[key], raw) for key in ("core", "adjacent", "wildcard"))
    relevance = min(3, 1.7 * len(core) + .8 * len(adjacent))
    novelty = min(2, 1.25 * bool(wildcard) + .55 * bool(adjacent) + .2 * bool(core and wildcard))
    detail = hits(r"\b\d+(?:[.,]\d+)?\b|case study|interview|survey|fieldwork|experiment|步骤|案例|采访|调查|数据|实验|田野", raw)
    mechanism = hits(r"\bhow\b|\bwhy\b|because|method|process|inside|behind|trade.?off|如何|为什么|方法|过程|机制|取舍|实践", raw)
    specificity = min(2, int(detail) + int(mechanism or len(summary) >= 140))
    usefulness = min(2, int(mechanism) + int(bool(item.get("action")) or hits(r"guide|framework|lesson|practice|指南|框架|经验|可以尝试", raw)))
    reading = reading_experience(item, source)
    negative, negative_matches = 0.0, []
    for group in profile.get("negative", []):
        if any_terms(group["patterns"], raw):
            negative += float(group.get("weight", 1)); negative_matches.append(group["name"])
    if hits(r"震惊|必看|惊呆|不看后悔|mind.blown|you won.t believe", title):
        negative += 2; negative_matches.append("标题党")
    source_bias = float(profile.get("sourceBias", {}).get(item.get("sourceId"), 0))
    total = round(max(0, relevance + novelty + specificity + usefulness + reading["score"] + source_bias - negative), 2)
    lane = "core" if core else "adjacent" if adjacent else "wildcard" if wildcard else "outside"
    reasons = []
    if missing: reasons.append("缺少具体文章简介，不能用来源名声补分")
    if not (core or adjacent or wildcard): reasons.append("与当前画像及相邻探索缺少具体连接")
    if negative_matches: reasons.append("降权：" + "、".join(negative_matches))
    if item.get("type") in ("纪录片", "电影", "剧集") and not chinese_video(item): reasons.append("暂无经核验的中文观看方式")
    qualified = relevance >= 1.5 or (lane == "wildcard" and novelty >= 1.2 and specificity >= 1 and usefulness >= 1)
    eligible = total >= 4.3 and specificity >= 1 and qualified and not missing and not reading.get("obstructive") and (item.get("type") not in ("纪录片", "电影", "剧集") or chinese_video(item))
    editorial = {"version": VERSION, "profileVersion": profile.get("version", 1), "score": total,
        "relevance": round(relevance, 2), "novelty": round(novelty, 2), "specificity": specificity,
        "usefulness": usefulness, "reading": reading["score"], "negative": round(negative, 2),
        "eligible": eligible, "exploration": lane in ("adjacent", "wildcard"), "lane": lane,
        "connections": core + adjacent + wildcard, "reasons": reasons,
        "basis": "依据具体标题、公开简介、实践性与 Lee 画像进行规则初筛；来源名气、语言和国别不加分",
        "interest": round(relevance, 2), "density": specificity, "continuing": usefulness}
    return editorial, reading

def screen(items, sources, profile=None):
    profile, by_id, out = profile or load_profile(), {s["id"]: s for s in sources}, []
    for item in items:
        editorial, reading = assess(item, by_id.get(item["sourceId"], {}), profile)
        out.append({**item, "editorial": editorial, "readingExperience": reading})
    return out
