from __future__ import annotations

import re
from collections import defaultdict

from lxml import etree

from app.bpmn.xmlsafe import parse_bpmn
from app.ordering import n_keys_between

Entry = dict[str, str]
Entries = dict[str, Entry]

ROOT_KEY_FALLBACK = "__root__"
XML_NS = "http://www.w3.org/XML/1998/namespace"
DERIVED_CHILDREN = {"incoming", "outgoing"}
SET_CHILDREN = {"flowNodeRef"}
FIRST_CONTENT = ("documentation", "extensionElements")
DI_TAGS = {"BPMNShape", "BPMNEdge"}
FLOW_TAGS = {"sequenceFlow", "messageFlow", "association"}
DATA_ASSOCIATION_TAGS = {"dataInputAssociation", "dataOutputAssociation"}

_ID_IN_CONTENT = re.compile(r'\sid="([^"]+)"')
_TEXT_IN_CONTENT = re.compile(r">([^<]*)<")


def escape_text(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def escape_attr(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("\n", "&#10;")
        .replace("\r", "&#13;")
        .replace("\t", "&#9;")
    )


def local_name(qname: str) -> str:
    return qname.rsplit(":", 1)[-1]


def _prefix(qname: str) -> str:
    return qname.rsplit(":", 1)[0] + ":" if ":" in qname else ""


def _qname(el: etree._Element) -> str:
    local = etree.QName(el).localname
    return f"{el.prefix}:{local}" if el.prefix else local


def _attributes(el: etree._Element) -> list[tuple[str, str]]:
    parent = el.getparent()
    parent_ns = parent.nsmap if parent is not None else {}
    result: list[tuple[str, str]] = []
    for prefix, uri in el.nsmap.items():
        if parent_ns.get(prefix) != uri:
            result.append(("xmlns" if prefix is None else f"xmlns:{prefix}", uri))
    for key, value in el.attrib.items():
        qn = etree.QName(key)
        if qn.namespace is None:
            result.append((qn.localname, value))
        elif qn.namespace == XML_NS:
            result.append((f"xml:{qn.localname}", value))
        else:
            prefix = next((p for p, u in el.nsmap.items() if u == qn.namespace and p is not None), None)
            result.append((f"{prefix}:{qn.localname}" if prefix else qn.localname, value))
    return result


def _own_text(el: etree._Element) -> str:
    parts = [el.text or ""] + [child.tail or "" for child in el]
    return "".join(parts)


def serialize_content(el: etree._Element) -> str:
    qn = _qname(el)
    attrs = sorted(_attributes(el))
    out = [f"<{qn}"]
    for name, value in attrs:
        out.append(f' {name}="{escape_attr(value)}"')
    children = list(el)
    inner: list[str] = []
    if children:
        if el.text and el.text.strip():
            inner.append(escape_text(el.text))
        for child in children:
            inner.append(serialize_content(child))
            if child.tail and child.tail.strip():
                inner.append(escape_text(child.tail))
    elif el.text:
        inner.append(escape_text(el.text))
    if not inner:
        out.append("/>")
    else:
        out.append(">")
        out.extend(inner)
        out.append(f"</{qn}>")
    return "".join(out)


def flatten_xml(xml: str | bytes) -> Entries:
    root = parse_bpmn(xml)
    entries: Entries = {}
    child_order: dict[str, list[str]] = defaultdict(list)

    def entry_id(el: etree._Element) -> str | None:
        value = el.get("id")
        if not value or value in entries or value == ROOT_KEY_FALLBACK:
            return None
        return value

    def visit(el: etree._Element, key: str, parent_key: str) -> None:
        entry: Entry = {"t": _qname(el), "p": parent_key}
        for name, value in _attributes(el):
            if name != "id":
                entry[f"@{name}"] = value
        text = _own_text(el)
        if text.strip():
            entry["x"] = text
        entries[key] = entry
        child_order[parent_key].append(key)
        groups: dict[str, list[str]] = defaultdict(list)
        for child in el:
            child_key = entry_id(child)
            if child_key is not None:
                visit(child, child_key, key)
                continue
            qn = _qname(child)
            local = local_name(qn)
            if local in DERIVED_CHILDREN and len(child) == 0:
                continue
            if local in SET_CHILDREN and len(child) == 0:
                entry[f"~{qn}|{(child.text or '').strip()}"] = "1"
                continue
            groups[qn].append(serialize_content(child))
        for qn, parts in groups.items():
            entry[f"#{qn}"] = "".join(parts)

    root_key = root.get("id") or ROOT_KEY_FALLBACK
    visit(root, root_key, "")
    for keys in child_order.values():
        for key, order in zip(keys, n_keys_between(None, None, len(keys)), strict=True):
            entries[key]["o"] = order
    return entries


def _content_ids(entries: Entries) -> set[str]:
    found: set[str] = set()
    for entry in entries.values():
        for key, value in entry.items():
            if key.startswith("#"):
                found.update(_ID_IN_CONTENT.findall(value))
    return found


def _content_refs(entry: Entry, tag_local: str) -> list[str]:
    refs: list[str] = []
    for key, value in entry.items():
        if key.startswith("#") and local_name(key[1:]) == tag_local:
            refs.extend(t.strip() for t in _TEXT_IN_CONTENT.findall(value) if t.strip())
    return refs


def _sort_key(entries: Entries, key: str) -> tuple[str, str]:
    return (entries[key].get("o", ""), key)


def _fix_plane(entries: Entries, plane_key: str, drop) -> None:
    diagram_key = entries[plane_key].get("p", "")
    root_key = entries.get(diagram_key, {}).get("p", "")
    diagrams = sorted(
        (
            k
            for k, e in entries.items()
            if e.get("p") == root_key and local_name(e.get("t", "")) == "BPMNDiagram"
        ),
        key=lambda k: _sort_key(entries, k),
    )
    if diagrams and diagrams[0] == diagram_key:
        candidates = sorted(
            (
                k
                for k, e in entries.items()
                if e.get("p") == root_key and local_name(e.get("t", "")) in ("collaboration", "process")
            ),
            key=lambda k: (local_name(entries[k]["t"]) != "collaboration", _sort_key(entries, k)),
        )
        if candidates:
            entries[plane_key]["@bpmnElement"] = candidates[0]
            return
    drop(diagram_key or plane_key)


def sanitize(entries: Entries) -> Entries:
    result: Entries = {k: dict(v) for k, v in entries.items()}

    roots = [k for k, e in result.items() if e.get("p", "") == ""]
    if len(roots) > 1:
        keep = next(
            (k for k in sorted(roots) if local_name(result[k]["t"]) == "definitions"), sorted(roots)[0]
        )
        for k in roots:
            if k != keep:
                del result[k]

    changed = True
    while changed:
        changed = False
        ids = set(result) | _content_ids(result)

        def drop(key: str) -> None:
            nonlocal changed
            if key in result:
                del result[key]
                changed = True

        for key in list(result):
            entry = result.get(key)
            if entry is None:
                continue
            parent = entry.get("p", "")
            if parent and parent not in result:
                drop(key)
                continue
            local = local_name(entry.get("t", ""))
            if (
                local in DI_TAGS
                and entry.get("@bpmnElement") not in ids
                or local in FLOW_TAGS
                and (entry.get("@sourceRef") not in ids or entry.get("@targetRef") not in ids)
                or local in DATA_ASSOCIATION_TAGS
                and any(
                    ref not in ids
                    for ref in _content_refs(entry, "sourceRef") + _content_refs(entry, "targetRef")
                )
                or local == "boundaryEvent"
                and entry.get("@attachedToRef") not in ids
            ):
                drop(key)
            elif local == "BPMNPlane" and entry.get("@bpmnElement") not in ids:
                _fix_plane(result, key, drop)

        for entry in result.values():
            for attr in ("@default", "@processRef"):
                if attr in entry and entry[attr] not in ids:
                    del entry[attr]
                    changed = True
            for set_key in [k for k in entry if k.startswith("~")]:
                if set_key.split("|", 1)[1] not in ids:
                    del entry[set_key]
                    changed = True

        seen: dict[str, str] = {}
        for key in sorted(
            (k for k, e in result.items() if local_name(e.get("t", "")) in DI_TAGS),
            key=lambda k: _sort_key(result, k),
        ):
            target = result[key].get("@bpmnElement", "")
            if target in seen:
                drop(key)
            else:
                seen[target] = key

    return result


def _content_order(key: str) -> tuple[int, str]:
    local = local_name(key[1:])
    return (FIRST_CONTENT.index(local) if local in FIRST_CONTENT else len(FIRST_CONTENT), key)


def reconstruct_xml(entries: Entries, *, clean: bool = True) -> str:
    data = sanitize(entries) if clean else entries
    children: dict[str, list[str]] = defaultdict(list)
    root_key: str | None = None
    for key, entry in data.items():
        parent = entry.get("p", "")
        if parent == "":
            root_key = key
        else:
            children[parent].append(key)
    if root_key is None:
        raise ValueError("document has no root entry")
    for keys in children.values():
        keys.sort(key=lambda k: _sort_key(data, k))

    incoming: dict[str, list[str]] = defaultdict(list)
    outgoing: dict[str, list[str]] = defaultdict(list)

    def collect_flows(key: str) -> None:
        entry = data[key]
        if local_name(entry["t"]) == "sequenceFlow":
            outgoing[entry.get("@sourceRef", "")].append(key)
            incoming[entry.get("@targetRef", "")].append(key)
        for child in children.get(key, []):
            collect_flows(child)

    collect_flows(root_key)

    out: list[str] = ['<?xml version="1.0" encoding="UTF-8"?>\n']

    def emit(key: str) -> None:
        entry = data[key]
        tag = entry["t"]
        out.append(f"<{tag}")
        if key != ROOT_KEY_FALLBACK:
            out.append(f' id="{escape_attr(key)}"')
        for name in sorted(k for k in entry if k.startswith("@")):
            out.append(f' {name[1:]}="{escape_attr(entry[name])}"')
        body: list[str] = []
        if "x" in entry:
            body.append(escape_text(entry["x"]))
        content_keys = sorted((k for k in entry if k.startswith("#")), key=_content_order)
        first = [k for k in content_keys if local_name(k[1:]) in FIRST_CONTENT]
        rest = [k for k in content_keys if local_name(k[1:]) not in FIRST_CONTENT]
        body.extend(entry[k] for k in first)
        prefix = _prefix(tag)
        body.extend(f"<{prefix}incoming>{escape_text(f)}</{prefix}incoming>" for f in incoming.get(key, []))
        body.extend(f"<{prefix}outgoing>{escape_text(f)}</{prefix}outgoing>" for f in outgoing.get(key, []))
        body.extend(entry[k] for k in rest)
        for set_key in sorted(k for k in entry if k.startswith("~")):
            qn, value = set_key[1:].split("|", 1)
            body.append(f"<{qn}>{escape_text(value)}</{qn}>")
        if not body and not children.get(key):
            out.append("/>")
            return
        out.append(">")
        out.extend(body)
        for child in children.get(key, []):
            emit(child)
        out.append(f"</{tag}>")

    emit(root_key)
    return "".join(out)
