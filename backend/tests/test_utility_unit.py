from pathlib import Path

import labelsourcing_utility as util


def _make_tree(tmp_path: Path) -> Path:
    root = tmp_path / "root"
    (root / "proj").mkdir(parents=True)
    (root / "proj" / "a.png").write_bytes(b"A")
    (root / "proj" / "b.txt").write_text("x")
    (root / "proj" / "deep").mkdir()
    (root / "proj" / "deep" / "c.jpg").write_bytes(b"C")
    return root


def test_resolve_in_roots_inside(tmp_path):
    root = _make_tree(tmp_path)
    assert util.resolve_in_roots([root], str(root / "proj")) is not None


def test_resolve_in_roots_outside(tmp_path):
    root = _make_tree(tmp_path)
    outside = tmp_path / "other"
    outside.mkdir()
    assert util.resolve_in_roots([root], str(outside)) is None


def test_resolve_in_roots_traversal(tmp_path):
    root = _make_tree(tmp_path)
    assert util.resolve_in_roots([root], str(root / "proj" / ".." / ".." / "secret")) is None


def test_resolve_in_roots_empty(tmp_path):
    root = _make_tree(tmp_path)
    assert util.resolve_in_roots([root], "") is None


def test_list_dirs_root_level(tmp_path):
    root = _make_tree(tmp_path)
    listing = util.list_dirs([root], "")
    assert listing["parent"] is None
    assert [d["path"] for d in listing["dirs"]] == [str(root)]


def test_list_dirs_subdir(tmp_path):
    root = _make_tree(tmp_path)
    listing = util.list_dirs([root], str(root / "proj"))
    assert [d["name"] for d in listing["dirs"]] == ["deep"]
    assert listing["image_count"] == 1  # a.png, not b.txt
    assert listing["parent"] == str(root)


def test_list_dirs_rejects_outside(tmp_path):
    root = _make_tree(tmp_path)
    outside = tmp_path / "x"
    outside.mkdir()
    try:
        util.list_dirs([root], str(outside))
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_scan_folder_recursive_images_only(tmp_path):
    root = _make_tree(tmp_path)
    folder, paths = util.scan_folder([root], str(root / "proj"))
    assert folder == str((root / "proj").resolve())
    assert sorted(paths) == ["a.png", "deep/c.jpg"]
