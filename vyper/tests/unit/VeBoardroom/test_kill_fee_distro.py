import brownie
import pytest


@pytest.fixture(scope="module")
def ve_boardroom(VeBoardroom, accounts, chain, ve_token, coin_a, coin_b, coin_c):
    boardroom = VeBoardroom.deploy(
        ve_token, accounts[0], accounts[1], {"from": accounts[0]},
    )
    boardroom.add_token(coin_a, chain.time())
    boardroom.add_token(coin_c, chain.time())
    boardroom.add_token(coin_b, chain.time())
    boardroom.delete_token(coin_c)
    yield boardroom


def test_assumptions(ve_boardroom, accounts):
    assert not ve_boardroom.is_killed()
    assert ve_boardroom.emergency_return() == accounts[1]


def test_kill(ve_boardroom, accounts):
    ve_boardroom.kill_me({"from": accounts[0]})

    assert ve_boardroom.is_killed()


def test_multi_kill(ve_boardroom, accounts):
    ve_boardroom.kill_me({"from": accounts[0]})
    ve_boardroom.kill_me({"from": accounts[0]})

    assert ve_boardroom.is_killed()


def test_killing_xfers_tokens(ve_boardroom, accounts, coin_a, coin_b):
    coin_a._mint_for_testing(31337, {"from": ve_boardroom.address})
    coin_b._mint_for_testing(1337, {"from": ve_boardroom.address})

    ve_boardroom.kill_me({"from": accounts[0]})

    assert ve_boardroom.emergency_return() == accounts[1]
    assert coin_a.balanceOf(accounts[1]) == 31337
    assert coin_b.balanceOf(accounts[1]) == 1337


def test_multi_kill_token_xfer(ve_boardroom, accounts, coin_a, coin_b):
    coin_a._mint_for_testing(10000, {"from": ve_boardroom.address})
    coin_b._mint_for_testing(1000, {"from": ve_boardroom.address})
    ve_boardroom.kill_me({"from": accounts[0]})

    coin_a._mint_for_testing(30000, {"from": ve_boardroom.address})
    coin_b._mint_for_testing(3000, {"from": ve_boardroom.address})
    ve_boardroom.kill_me({"from": accounts[0]})

    assert ve_boardroom.emergency_return() == accounts[1]
    assert coin_a.balanceOf(accounts[1]) == 40000
    assert coin_b.balanceOf(accounts[1]) == 4000


@pytest.mark.parametrize("idx", range(1, 3))
def test_only_admin(ve_boardroom, accounts, idx):
    with brownie.reverts():
        ve_boardroom.kill_me({"from": accounts[idx]})


@pytest.mark.parametrize("idx", range(1, 3))
def test_cannot_claim_after_killed(ve_boardroom, accounts, idx, coin_a, coin_b):
    ve_boardroom.kill_me({"from": accounts[0]})

    with brownie.reverts():
        ve_boardroom.claim(coin_a, {"from": accounts[idx]})

    with brownie.reverts():
        ve_boardroom.claim(coin_b, {"from": accounts[idx]})


@pytest.mark.parametrize("idx", range(1, 3))
def test_cannot_claim_for_after_killed(ve_boardroom, accounts, alice, idx, coin_a, coin_b):
    ve_boardroom.kill_me({"from": accounts[0]})

    with brownie.reverts():
        ve_boardroom.claim(coin_a, alice, {"from": accounts[idx]})

    with brownie.reverts():
        ve_boardroom.claim(coin_b, alice, {"from": accounts[idx]})


@pytest.mark.parametrize("idx", range(1, 3))
def test_cannot_claim_many_after_killed(ve_boardroom, accounts, alice, idx, coin_a, coin_b):
    ve_boardroom.kill_me({"from": accounts[0]})

    with brownie.reverts():
        ve_boardroom.claim_many(coin_a, [alice] * 20, {"from": accounts[idx]})
    with brownie.reverts():
        ve_boardroom.claim_many(coin_b, [alice] * 20, {"from": accounts[idx]})
