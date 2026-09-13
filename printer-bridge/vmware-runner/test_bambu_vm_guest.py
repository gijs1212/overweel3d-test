from __future__ import annotations

import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

from bambu_vm_guest import VM_AGENT_VERSION, build_bambu_connect_import_url, set_checkbox_state


class BambuConnectImportUrlTests(unittest.TestCase):
    def test_checkbox_is_only_clicked_when_state_must_change(self) -> None:
        class Checkbox:
            def __init__(self, state: bool):
                self.state = state
                self.clicks = 0

            def wait(self, *_args, **_kwargs):
                return self

            def get_toggle_state(self):
                return int(self.state)

            def click_input(self):
                self.state = not self.state
                self.clicks += 1

        checkbox = Checkbox(False)
        set_checkbox_state(checkbox, True, "bed-leveling")
        set_checkbox_state(checkbox, True, "bed-leveling")
        self.assertTrue(checkbox.state)
        self.assertEqual(checkbox.clicks, 1)

    def test_builds_official_import_file_url(self) -> None:
        source = Path("C:/Overweel3D/Plaat 1.gcode.3mf")
        with patch.object(Path, "is_file", return_value=True):
            url = build_bambu_connect_import_url(source)
        parsed = urllib.parse.urlparse(url)
        parameters = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(parsed.scheme, "bambu-connect")
        self.assertEqual(parsed.netloc, "import-file")
        self.assertEqual(parameters["path"], [str(source.resolve())])
        self.assertEqual(parameters["name"], [source.name])
        self.assertEqual(parameters["version"], ["1.0.0"])

    def test_rejects_unknown_file_type(self) -> None:
        source = Path("C:/Overweel3D/not-a-print.txt")
        with patch.object(Path, "is_file", return_value=True):
            with self.assertRaises(RuntimeError):
                build_bambu_connect_import_url(source)

    def test_version(self) -> None:
        self.assertEqual(VM_AGENT_VERSION, "2.3.2")


if __name__ == "__main__":
    unittest.main()
