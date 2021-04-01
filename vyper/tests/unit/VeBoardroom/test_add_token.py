import pytest
import brownie


@pytest.mark.parametrize("idx", range(1, 3))
def test_only_admin(ve_boardroom, accounts, idx, coin_a, chain):
    boardroom = ve_boardroom()
    with brownie.reverts():
        boardroom.add_token(coin_a, chain.time(), {"from": accounts[idx]})


def test_admin_can_add_token(ve_boardroom, accounts, coin_a, chain):
    boardroom = ve_boardroom()
    boardroom.add_token(coin_a, chain.time(), {"from": accounts[0]})
    assert boardroom.tokens(0) == coin_a
