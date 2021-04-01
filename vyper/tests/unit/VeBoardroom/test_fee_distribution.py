DAY = 86400
WEEK = 7 * DAY


def test_deposited_after(web3, chain, accounts, ve_token, ve_boardroom, coin_a, coin_b, coin_c, token, fn_isolation):
    alice, bob = accounts[0:2]
    amount = 1000 * 10 ** 18
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, chain.time())
    ve_boardroom.add_token(coin_c, chain.time())
    ve_boardroom.add_token(coin_b, chain.time())
    ve_boardroom.delete_token(coin_c)

    token.approve(ve_token.address, amount * 10, {"from": alice})
    coin_a._mint_for_testing(100 * 10 ** 18, {"from": bob})

    for i in range(5):
        for j in range(7):
            coin_a.transfer(ve_boardroom, 10 ** 18, {"from": bob})
            ve_boardroom.checkpoint_token(coin_a)
            ve_boardroom.checkpoint_total_supply()
            chain.sleep(DAY)
            chain.mine()

    chain.sleep(WEEK)
    chain.mine()

    ve_token.create_lock(
        amount, chain[-1].timestamp + 3 * WEEK, {"from": alice})
    chain.sleep(2 * WEEK)

    ve_boardroom.claim(coin_a, {"from": alice})

    assert coin_a.balanceOf(alice) == 0


def test_deposited_during(web3, chain, accounts, ve_token, ve_boardroom, coin_a, coin_b, coin_c, token, fn_isolation):
    alice, bob = accounts[0:2]
    amount = 1000 * 10 ** 18

    token.approve(ve_token.address, amount * 10, {"from": alice})
    coin_a._mint_for_testing(100 * 10 ** 18, {"from": bob})

    chain.sleep(WEEK)
    ve_token.create_lock(
        amount, chain[-1].timestamp + 8 * WEEK, {"from": alice})
    chain.sleep(WEEK)
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, chain.time())
    ve_boardroom.add_token(coin_c, chain.time())
    ve_boardroom.add_token(coin_b, chain.time())
    ve_boardroom.delete_token(coin_c)

    for i in range(3):
        for j in range(7):
            coin_a.transfer(ve_boardroom, 10 ** 18, {"from": bob})
            ve_boardroom.checkpoint_token(coin_a)
            ve_boardroom.checkpoint_total_supply()
            chain.sleep(DAY)
            chain.mine()

    chain.sleep(WEEK)
    ve_boardroom.checkpoint_token(coin_a)

    ve_boardroom.claim(coin_a, {"from": alice})

    assert abs(coin_a.balanceOf(alice) - 21 * 10 ** 18) < 10


def test_deposited_before(web3, chain, accounts, ve_token, ve_boardroom, coin_a, coin_b, coin_c, token, fn_isolation):
    alice, bob = accounts[0:2]
    amount = 1000 * 10 ** 18

    token.approve(ve_token.address, amount * 10, {"from": alice})
    coin_a._mint_for_testing(100 * 10 ** 18, {"from": bob})

    ve_token.create_lock(
        amount, chain[-1].timestamp + 8 * WEEK, {"from": alice})
    chain.sleep(WEEK)
    chain.mine()
    start_time = int(chain.time())
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, chain.time())
    ve_boardroom.add_token(coin_c, chain.time())
    ve_boardroom.add_token(coin_b, chain.time())
    ve_boardroom.delete_token(coin_c)
    chain.sleep(WEEK * 5)

    coin_a.transfer(ve_boardroom, 10 ** 19, {"from": bob})
    ve_boardroom.checkpoint_token(coin_a)
    chain.sleep(WEEK)
    ve_boardroom.checkpoint_token(coin_a)

    ve_boardroom.claim(coin_a, {"from": alice})

    assert abs(coin_a.balanceOf(alice) - 10 ** 19) < 10


def test_deposited_twice(web3, chain, accounts, ve_token, ve_boardroom, coin_a, coin_b, coin_c, token, fn_isolation):
    alice, bob = accounts[0:2]
    amount = 1000 * 10 ** 18

    token.approve(ve_token.address, amount * 10, {"from": alice})
    coin_a._mint_for_testing(100 * 10 ** 18, {"from": bob})

    ve_token.create_lock(
        amount, chain[-1].timestamp + 4 * WEEK, {"from": alice})
    chain.sleep(WEEK)
    chain.mine()
    start_time = int(chain.time())
    chain.sleep(WEEK * 3)
    ve_token.withdraw({"from": alice})
    exclude_time = chain[-1].timestamp // WEEK * WEEK  # Alice had 0 here
    ve_token.create_lock(
        amount, chain[-1].timestamp + 4 * WEEK, {"from": alice})
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, chain.time())
    ve_boardroom.add_token(coin_c, chain.time())
    ve_boardroom.add_token(coin_b, chain.time())
    ve_boardroom.delete_token(coin_c)
    chain.sleep(WEEK * 2)

    coin_a.transfer(ve_boardroom, 10 ** 19, {"from": bob})
    ve_boardroom.checkpoint_token(coin_a)
    chain.sleep(WEEK)
    ve_boardroom.checkpoint_token(coin_a)

    ve_boardroom.claim(coin_a, {"from": alice})

    tokens_to_exclude = ve_boardroom.tokens_per_week(coin_a, exclude_time)
    assert abs(10 ** 19 - coin_a.balanceOf(alice) - tokens_to_exclude) < 10


def test_deposited_parallel(web3, chain, accounts, ve_token, ve_boardroom, coin_a, coin_b, coin_c, token, fn_isolation):
    alice, bob, charlie = accounts[0:3]
    amount = 1000 * 10 ** 18

    token.approve(ve_token.address, amount * 10, {"from": alice})
    token.approve(ve_token.address, amount * 10, {"from": bob})
    token.transfer(bob, amount, {"from": alice})
    coin_a._mint_for_testing(100 * 10 ** 18, {"from": charlie})

    ve_token.create_lock(
        amount, chain[-1].timestamp + 8 * WEEK, {"from": alice})
    ve_token.create_lock(amount, chain[-1].timestamp + 8 * WEEK, {"from": bob})
    chain.sleep(WEEK)
    chain.mine()
    start_time = int(chain.time())
    ve_boardroom = ve_boardroom()
    ve_boardroom.add_token(coin_a, chain.time())
    ve_boardroom.add_token(coin_c, chain.time())
    ve_boardroom.add_token(coin_b, chain.time())
    ve_boardroom.delete_token(coin_c)
    chain.sleep(WEEK * 5)

    coin_a.transfer(ve_boardroom, 10 ** 19, {"from": charlie})
    ve_boardroom.checkpoint_token(coin_a)
    chain.sleep(WEEK)
    ve_boardroom.checkpoint_token(coin_a)

    ve_boardroom.claim(coin_a, {"from": alice})
    ve_boardroom.claim(coin_a, {"from": bob})

    balance_alice = coin_a.balanceOf(alice)
    balance_bob = coin_a.balanceOf(bob)
    assert balance_alice == balance_bob
    assert abs(balance_alice + balance_bob - 10 ** 19) < 20
