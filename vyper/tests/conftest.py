import pytest

@pytest.fixture(scope="module")
def token(ERC20, accounts):
    yield ERC20.deploy("KlonX", "KlonX", 18, {"from": accounts[0]})

@pytest.fixture(scope="module")
def syn_token1(ERC20, accounts):
    yield ERC20.deploy("KBTC", "KBTC", 18, {"from": accounts[0]})

@pytest.fixture(scope="module")
def syn_token2(ERC20, accounts):
    yield ERC20.deploy("KUSD", "KUSD", 18, {"from": accounts[0]})


@pytest.fixture(scope="module")
def ve_token(VeToken, accounts, token):
    yield VeToken.deploy(
        token, "Voting-escrowed KlonX", "veKlonX", "veKlonX", {"from": accounts[0]}
    )

@pytest.fixture(scope="module")
def ve_boardroom(VeBoardroom, ve_token, accounts):
    def f():
        return VeBoardroom.deploy(
            ve_token, accounts[0], accounts[0], {"from": accounts[0]}
        )

    yield f