from brownie import ZERO_ADDRESS

WEEK = 86400 * 7


def test_claim_many(alice, bob, charlie, chain, ve_token, ve_boardroom, coin_a, token, fn_isolation):
    amount = 1000 * 10 ** 18

    for acct in (alice, bob, charlie):
        token.approve(ve_token, amount * 10, {"from": acct})
        token.transfer(acct, amount, {"from": alice})
        ve_token.create_lock(amount, chain.time() + 8 * WEEK, {"from": acct})

    chain.sleep(WEEK)
    chain.mine()
    start_time = int(chain.time())
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, start_time)
    chain.sleep(WEEK * 5)
    
    coin_a._mint_for_testing(10 ** 19, {"from": ve_boardroom})
    ve_boardroom.checkpoint_token(coin_a)
    chain.sleep(WEEK)
    ve_boardroom.checkpoint_token(coin_a)

    ve_boardroom.claim_many(coin_a, [alice, bob, charlie] + [ZERO_ADDRESS] * 17, {"from": alice})

    balances = [coin_a.balanceOf(i) for i in (alice, bob, charlie)]
    chain.undo()

    ve_boardroom.claim(coin_a, {"from": alice})
    ve_boardroom.claim(coin_a, {"from": bob})
    ve_boardroom.claim(coin_a, {"from": charlie})

    assert balances == [coin_a.balanceOf(i) for i in (alice, bob, charlie)]


def test_claim_many_same_account(
    alice, bob, charlie, chain, ve_token, ve_boardroom, coin_a, token
):
    amount = 1000 * 10 ** 18

    for acct in (alice, bob, charlie):
        token.approve(ve_token, amount * 10, {"from": acct})
        token.transfer(acct, amount, {"from": alice})
        ve_token.create_lock(amount, chain.time() + 8 * WEEK, {"from": acct})

    chain.sleep(WEEK)
    chain.mine()
    start_time = int(chain.time())
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, start_time)
    chain.sleep(WEEK * 5)

    
    coin_a._mint_for_testing(10 ** 19, {"from": ve_boardroom})
    ve_boardroom.checkpoint_token(coin_a)
    chain.sleep(WEEK)
    ve_boardroom.checkpoint_token(coin_a)

    expected = ve_boardroom.claim.call(coin_a, {"from": alice})

    ve_boardroom.claim_many(coin_a, [alice] * 20, {"from": alice})

    assert coin_a.balanceOf(alice) == expected