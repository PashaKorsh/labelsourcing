import pytest

from conftest import fake_utility


async def _create_utility_dataset(client, cookie, utility_id):
    r = await client.post("/datasets/", headers=cookie, json={
        "description": "pytest utility ds",
        "source_type": "utility",
        "utility_id": utility_id,
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def test_pairing_code_single_use(client, user_cookie):
    code = (await client.post("/utility/pairing-code", headers=user_cookie)).json()["code"]
    r1 = await client.post("/utility/pair", json={"code": code, "name": "u1"})
    assert r1.status_code == 200
    r2 = await client.post("/utility/pair", json={"code": code, "name": "u2"})
    assert r2.status_code == 400
    await client.delete(f"/utility/{r1.json()['utility_id']}", headers=user_cookie)


async def test_auth_gates(client):
    assert (await client.post("/utility/pairing-code")).status_code == 401
    assert (await client.get("/utility/")).status_code == 401
    assert (await client.post("/utility/heartbeat", headers={"Authorization": "Bearer bad.tok"}, json={})).status_code == 401


async def test_create_utility_dataset_requires_utility(client, user_cookie):
    r = await client.post("/datasets/", headers=user_cookie, json={
        "description": "no utility", "source_type": "utility",
    })
    assert r.status_code == 400


async def test_online_status(client, user_cookie, paired_utility, sample_root, tmp_path):
    token = paired_utility["token"]
    uid = paired_utility["utility_id"]
    async with fake_utility(token, [sample_root], tmp_path / "cfg.json"):
        utils = (await client.get("/utility/", headers=user_cookie)).json()
        me = next(u for u in utils if u["id"] == uid)
        assert me["online"] is True
    utils = (await client.get("/utility/", headers=user_cookie)).json()
    me = next(u for u in utils if u["id"] == uid)
    assert me["online"] is False


async def test_dirs_scan_and_proxy(client, user_cookie, paired_utility, sample_root, tmp_path):
    token = paired_utility["token"]
    uid = paired_utility["utility_id"]
    ds_id = await _create_utility_dataset(client, user_cookie, uid)

    async with fake_utility(token, [sample_root], tmp_path / "cfg.json"):
        roots = (await client.get(f"/utility/{uid}/dirs", headers=user_cookie, params={"path": ""})).json()
        assert roots["dirs"][0]["path"] == str(sample_root)

        project = str(sample_root / "projectA")
        listing = (await client.get(f"/utility/{uid}/dirs", headers=user_cookie, params={"path": str(sample_root)})).json()
        assert any(d["path"] == project for d in listing["dirs"])

        scan = (await client.post(f"/utility/{uid}/scan", headers=user_cookie,
                                  json={"dataset_id": ds_id, "path": project})).json()
        assert scan["added"] == 3  # a.png, b.jpg, more/c.png — not notes.txt

        ds = (await client.get(f"/datasets/{ds_id}", headers=user_cookie)).json()
        assert ds["utility_folder"] == project

        tasks = (await client.get(f"/datasets/{ds_id}/tasks", headers=user_cookie)).json()
        task = next(t for t in tasks if t["url"] == "a.png")

        pr = await client.get(f"/proxy/{task['id']}", headers=user_cookie)
        assert pr.status_code == 200
        assert pr.content == b"\x89PNG\r\n\x1a\nA"

    # утилита отключилась → файл недоступен
    pr = await client.get(f"/proxy/{task['id']}", headers=user_cookie)
    assert pr.status_code == 503

    await client.delete(f"/datasets/{ds_id}", headers=user_cookie)


async def test_rescan_picks_new_files(client, user_cookie, paired_utility, sample_root, tmp_path):
    token = paired_utility["token"]
    uid = paired_utility["utility_id"]
    ds_id = await _create_utility_dataset(client, user_cookie, uid)
    project = sample_root / "projectA"

    async with fake_utility(token, [sample_root], tmp_path / "cfg.json"):
        first = (await client.post(f"/utility/{uid}/scan", headers=user_cookie,
                                   json={"dataset_id": ds_id, "path": str(project)})).json()
        assert first["added"] == 3

        (project / "d.png").write_bytes(b"\x89PNG\r\n\x1a\nD")
        rescan = (await client.post(f"/utility/{uid}/rescan/{ds_id}", headers=user_cookie)).json()
        assert rescan["added"] == 1
        assert rescan["total"] == 4

    await client.delete(f"/datasets/{ds_id}", headers=user_cookie)


async def test_next_proxy_vs_direct(client, user_cookie, paired_utility, sample_root, tmp_path):
    token = paired_utility["token"]
    uid = paired_utility["utility_id"]
    ds_id = await _create_utility_dataset(client, user_cookie, uid)

    async with fake_utility(token, [sample_root], tmp_path / "cfg.json"):
        await client.post(f"/utility/{uid}/scan", headers=user_cookie,
                          json={"dataset_id": ds_id, "path": str(sample_root / "projectA")})

        r1 = (await client.get(f"/datasets/{ds_id}/next", params={"count": 1}, headers=user_cookie)).json()
        assert r1 and r1[0]["url"] is None  # прокси-режим по умолчанию

        await client.post("/utility/heartbeat",
                          headers={"Authorization": f"Bearer {token}"},
                          json={"public_base_url": "https://moder.example.com"})
        await client.patch(f"/datasets/{ds_id}", headers=user_cookie, json={"settings": {"use_proxy": False}})

        r2 = (await client.get(f"/datasets/{ds_id}/next", params={"count": 1}, headers=user_cookie)).json()
        assert r2[0]["url"].startswith(f"https://moder.example.com/{ds_id}/")

    await client.delete(f"/datasets/{ds_id}", headers=user_cookie)
