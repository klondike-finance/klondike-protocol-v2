import pytest

WEEK = 86400 * 7

@pytest.fixture(scope="module")
def distributor(accounts, chain, ve_boardroom, ve_token, token, syn_token1, syn_token2):
    distributor = ve_boardroom()
    t = chain.time()
    distributor.add_token(syn_token1, t)
    distributor.add_token(syn_token2, t)

    token.approve(ve_token, 2 ** 256 - 1, {"from": accounts[0]})
    token._mint_for_testing(10 ** 21, {"from": accounts[0]})
    ve_token.create_lock(10 ** 21, chain.time() + WEEK * 52, {"from": accounts[0]})

    yield distributor


def test_checkpoint_total_supply(accounts, chain, distributor, ve_token):
    start_time = distributor.time_cursor()

    week_epoch = (chain.time() + WEEK) // WEEK * WEEK
    chain.mine(timestamp=week_epoch)
    week_block = chain[-1].number

    # sleep for 1 second to ensure the total suppply checkpoint happens in the new period
    chain.sleep(1)
    distributor.checkpoint_total_supply({"from": accounts[0]})

    assert distributor.ve_supply(start_time) == 0
    assert distributor.ve_supply(week_epoch) == ve_token.totalSupplyAt(week_block)


def test_advance_time_cursor(accounts, chain, distributor):
    start_time = distributor.time_cursor()
    chain.sleep(86400 * 365)
    chain.mine()

    distributor.checkpoint_total_supply({"from": accounts[0]})

    # total supply checkpoints should advance at most 20 weeks at a time
    assert distributor.time_cursor() == start_time + WEEK * 20
    assert distributor.ve_supply(start_time + WEEK * 19) > 0
    assert distributor.ve_supply(start_time + WEEK * 20) == 0

    distributor.checkpoint_total_supply({"from": accounts[0]})

    assert distributor.time_cursor() == start_time + WEEK * 40
    assert distributor.ve_supply(start_time + WEEK * 20) > 0
    assert distributor.ve_supply(start_time + WEEK * 39) > 0
    assert distributor.ve_supply(start_time + WEEK * 40) == 0


def test_claim_checkpoints_total_supply(accounts, chain, distributor, syn_token1):
    # update time cursor to current
    distributor.claim(syn_token1, {"from": accounts[0]})
    start_time = distributor.time_cursor()
    chain.sleep(WEEK)
    chain.mine()
    distributor.claim(syn_token1, {"from": accounts[0]})

    assert distributor.time_cursor() == start_time + WEEK


def test_toggle_allow_checkpoint(accounts, chain, distributor, syn_token1):

    last_token_time = distributor.last_token_time(syn_token1)
    chain.sleep(WEEK)

    distributor.claim(syn_token1, {"from": accounts[0]})
    assert distributor.last_token_time(syn_token1) == last_token_time

    distributor.toggle_allow_checkpoint_token({"from": accounts[0]})
    tx = distributor.claim(syn_token1, {"from": accounts[0]})

    assert distributor.last_token_time(syn_token1) == tx.timestamp