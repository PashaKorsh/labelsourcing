import uuid

import pytest_asyncio


async def _cookie(client, preset):
    r = await client.post("/auth/dev-login", params={"user": preset})
    return {"Cookie": f"access_token={r.cookies.get('access_token')}"}


@pytest_asyncio.fixture
async def admin_cookie(client):
    return await _cookie(client, "admin")


async def _make_moderator(client, admin_cookie):
    mod_cookie = await _cookie(client, "annotator-1")
    users = (await client.get("/users/", headers=admin_cookie)).json()
    uid = next(u["id"] for u in users if u["email"] == "dev-annotator-1@localhost")
    roles = (await client.get("/users/roles", headers=admin_cookie)).json()
    mod_role = next(r["id"] for r in roles if r["name"] == "moderator")
    await client.patch(f"/users/{uid}", headers=admin_cookie, json={"role_ids": [mod_role]})
    return mod_cookie, uid


async def _create_url_dataset(client, cookie, **extra):
    body = {"description": "ds", "source_type": "url", **extra}
    r = await client.post("/datasets/", headers=cookie, json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def test_roles_endpoint(client, admin_cookie):
    roles = (await client.get("/users/roles", headers=admin_cookie)).json()
    names = {r["name"] for r in roles}
    assert {"admin", "moderator"}.issubset(names)


async def test_roles_endpoint_forbidden_for_user(client):
    user_cookie = await _cookie(client, "annotator-2")
    r = await client.get("/users/roles", headers=user_cookie)
    assert r.status_code == 403


async def test_plain_user_cannot_create_dataset(client):
    user_cookie = await _cookie(client, "annotator-2")
    r = await client.post("/datasets/", headers=user_cookie, json={"description": "x", "source_type": "url"})
    assert r.status_code == 403


async def test_moderator_crud_own_dataset(client, admin_cookie):
    mod_cookie, _ = await _make_moderator(client, admin_cookie)
    ds_id = await _create_url_dataset(client, mod_cookie)

    assert (await client.patch(f"/datasets/{ds_id}", headers=mod_cookie,
                               json={"description": "upd"})).status_code == 200
    assert (await client.get(f"/datasets/{ds_id}/tasks", headers=mod_cookie)).status_code == 200
    assert (await client.delete(f"/datasets/{ds_id}", headers=mod_cookie)).status_code == 204


async def test_moderator_cannot_manage_others_dataset(client, admin_cookie):
    mod_cookie, _ = await _make_moderator(client, admin_cookie)
    ds_id = await _create_url_dataset(client, admin_cookie)  # owner = admin
    try:
        assert (await client.patch(f"/datasets/{ds_id}", headers=mod_cookie,
                                   json={"description": "hack"})).status_code == 403
        assert (await client.get(f"/datasets/{ds_id}/tasks", headers=mod_cookie)).status_code == 403
        assert (await client.delete(f"/datasets/{ds_id}", headers=mod_cookie)).status_code == 403
    finally:
        await client.delete(f"/datasets/{ds_id}", headers=admin_cookie)


async def test_admin_can_manage_any_dataset(client, admin_cookie):
    mod_cookie, _ = await _make_moderator(client, admin_cookie)
    ds_id = await _create_url_dataset(client, mod_cookie)  # owner = moderator
    # админ правит и удаляет чужой датасет
    assert (await client.patch(f"/datasets/{ds_id}", headers=admin_cookie,
                               json={"description": "by admin"})).status_code == 200
    assert (await client.delete(f"/datasets/{ds_id}", headers=admin_cookie)).status_code == 204


async def test_filter_mine_and_tag(client, admin_cookie):
    tag_name = f"t-{uuid.uuid4().hex[:8]}"
    tag = (await client.post("/tags/", headers=admin_cookie, json={"name": tag_name, "color": "#abc"})).json()

    tagged = await _create_url_dataset(client, admin_cookie, tag_ids=[tag["id"]])
    plain = await _create_url_dataset(client, admin_cookie)
    try:
        by_tag = (await client.get("/datasets/", headers=admin_cookie, params={"tag_ids": tag["id"]})).json()
        ids = {d["id"] for d in by_tag}
        assert tagged in ids and plain not in ids

        mine = (await client.get("/datasets/", headers=admin_cookie, params={"mine": "true"})).json()
        assert tagged in {d["id"] for d in mine}
    finally:
        await client.delete(f"/datasets/{tagged}", headers=admin_cookie)
        await client.delete(f"/datasets/{plain}", headers=admin_cookie)
        await client.delete(f"/tags/{tag['id']}", headers=admin_cookie)


async def test_filter_status(client, admin_cookie):
    ds_id = await _create_url_dataset(client, admin_cookie)
    try:
        not_started = (await client.get("/datasets/", headers=admin_cookie,
                                        params={"status": "NOT_STARTED"})).json()
        assert ds_id in {d["id"] for d in not_started}
        completed = (await client.get("/datasets/", headers=admin_cookie,
                                      params={"status": "COMPLETED"})).json()
        assert ds_id not in {d["id"] for d in completed}
    finally:
        await client.delete(f"/datasets/{ds_id}", headers=admin_cookie)
