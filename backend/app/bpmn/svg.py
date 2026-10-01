import re

from lxml import etree

from app.bpmn.xmlsafe import InvalidXml, parse_xml

SVG_NS = "http://www.w3.org/2000/svg"

_FORBIDDEN_ELEMENTS = {"script", "foreignobject", "iframe", "object", "embed", "audio", "video"}
_ANIMATION_ELEMENTS = {"animate", "set", "animatemotion", "animatetransform"}


def _local(name: str) -> str:
    return etree.QName(name).localname


def _allowed_href(value: str) -> bool:
    value = value.strip()
    return value.startswith("#") or value.lower().startswith("data:image/")


def _animates_href(el: etree._Element) -> bool:
    target = (el.get("attributeName") or "").strip().rsplit(":", 1)[-1]
    return target.lower() == "href"


def _drop(el: etree._Element) -> None:
    parent = el.getparent()
    if parent is None:
        return
    if el.tail:
        previous = el.getprevious()
        if previous is not None:
            previous.tail = (previous.tail or "") + el.tail
        else:
            parent.text = (parent.text or "") + el.tail
    parent.remove(el)


_PLAIN_DOCTYPE = re.compile(
    rb"<!DOCTYPE\s+svg\s+PUBLIC\s+\"[^\"<>\[\]]*\"\s+\"[^\"<>\[\]]*\"\s*>", re.IGNORECASE
)


def sanitize_svg(data: bytes) -> str:
    root = parse_xml(_PLAIN_DOCTYPE.sub(b"", data, count=1))
    if root.tag != f"{{{SVG_NS}}}svg":
        raise InvalidXml("not_svg")

    doomed: list[etree._Element] = []
    for el in root.iter(etree.Element):
        name = _local(el.tag).lower()
        if name in _FORBIDDEN_ELEMENTS or (name in _ANIMATION_ELEMENTS and _animates_href(el)):
            doomed.append(el)
            continue
        for attr in list(el.attrib):
            local = _local(attr).lower()
            if local.startswith("on") or (local == "href" and not _allowed_href(el.attrib[attr])):
                del el.attrib[attr]
    for el in doomed:
        _drop(el)
    return etree.tostring(root, encoding="unicode")
