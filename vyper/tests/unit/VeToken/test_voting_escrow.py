import brownie


def test_commit_admin_only(ve_token, accounts):
    with brownie.reverts():
        ve_token.commit_transfer_ownership(accounts[1], {"from": accounts[1]})


def test_apply_admin_only(ve_token, accounts):
    with brownie.reverts():
        ve_token.apply_transfer_ownership({"from": accounts[1]})


def test_commit_transfer_ownership(ve_token, accounts):
    ve_token.commit_transfer_ownership(accounts[1], {"from": accounts[0]})

    assert ve_token.admin() == accounts[0]
    assert ve_token.future_admin() == accounts[1]


def test_apply_transfer_ownership(ve_token, accounts):
    ve_token.commit_transfer_ownership(accounts[1], {"from": accounts[0]})
    ve_token.apply_transfer_ownership({"from": accounts[0]})

    assert ve_token.admin() == accounts[1]


def test_apply_without_commit(ve_token, accounts):
    with brownie.reverts():
        ve_token.apply_transfer_ownership({"from": accounts[0]})