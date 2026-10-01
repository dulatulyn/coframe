import pytest

from app.bpmn.svg import sanitize_svg
from app.bpmn.xmlsafe import InvalidXml

BPMN_JS_SVG = b"""<?xml version="1.0" encoding="utf-8"?>
<!-- created with bpmn-js / http://bpmn.io -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
<circle cx="10" cy="10" r="5"/></svg>"""


def test_bpmn_js_export_with_public_doctype_is_accepted():
    cleaned = sanitize_svg(BPMN_JS_SVG)
    assert cleaned.startswith("<svg") and "<circle" in cleaned and "DOCTYPE" not in cleaned


def test_doctype_with_internal_subset_is_still_rejected():
    evil = b'<!DOCTYPE svg PUBLIC "a" "b" [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>'
    with pytest.raises(InvalidXml):
        sanitize_svg(evil)
