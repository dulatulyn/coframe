from lxml import etree

BPMN_MODEL_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMN_DI_NS = "http://www.omg.org/spec/BPMN/20100524/DI"
DMN_NAMESPACES = {
    "https://www.omg.org/spec/DMN/20191111/MODEL/",
    "http://www.omg.org/spec/DMN/20180521/MODEL/",
    "http://www.omg.org/spec/DMN/20151101/dmn.xsd",
}


class InvalidXml(ValueError):
    pass


def _parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
        huge_tree=False,
        remove_comments=True,
        remove_pis=True,
    )


def parse_xml(data: str | bytes) -> etree._Element:
    raw = data.encode("utf-8") if isinstance(data, str) else data
    if b"<!DOCTYPE" in raw or b"<!ENTITY" in raw:
        raise InvalidXml("doctype_not_allowed")
    try:
        return etree.fromstring(raw, _parser())
    except etree.XMLSyntaxError as exc:
        raise InvalidXml(f"malformed_xml: {exc}") from exc


def parse_bpmn(data: str | bytes) -> etree._Element:
    root = parse_xml(data)
    if etree.QName(root).namespace != BPMN_MODEL_NS or etree.QName(root).localname != "definitions":
        raise InvalidXml("not_bpmn")
    return root


def parse_dmn(data: str | bytes) -> etree._Element:
    root = parse_xml(data)
    if etree.QName(root).namespace not in DMN_NAMESPACES or etree.QName(root).localname != "definitions":
        raise InvalidXml("not_dmn")
    return root
