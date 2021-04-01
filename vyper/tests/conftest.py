import pytest


@pytest.fixture(autouse=True)
def isolation_setup(fn_isolation):
    pass


@pytest.fixture(scope="session")
def alice(accounts):
    yield accounts[0]


@pytest.fixture(scope="session")
def bob(accounts):
    yield accounts[1]


@pytest.fixture(scope="session")
def charlie(accounts):
    yield accounts[2]


@pytest.fixture(scope="module")
def token(ERC20, accounts):
    tkn = ERC20.deploy("KlonX", "KlonX", 18, {"from": accounts[0]})
    tkn._mint_for_testing(10 ** 30, {"from": accounts[0]})
    yield tkn


@pytest.fixture(scope="module")
def coin_a(ERC20, accounts):
    yield ERC20.deploy("Coin A", "USDA", 18, {"from": accounts[0]})


@pytest.fixture(scope="module")
def coin_b(ERC20, accounts):
    yield ERC20.deploy("Coin B", "USDB", 18, {"from": accounts[0]})


@pytest.fixture(scope="module")
def coin_c(ERC20, accounts):
    yield ERC20.deploy("Coin C", "USDC", 18, {"from": accounts[0]})


@pytest.fixture(scope="module")
def ve_token(VeToken, accounts, token):
    yield VeToken.deploy(
        token, "Voting-escrowed KlonX", "veKlonX", "veKlonX", {
            "from": accounts[0]}
    )


@pytest.fixture(scope="module")
def ve_boardroom(VeBoardroom, ve_token, accounts):
    def f():
        return VeBoardroom.deploy(
            ve_token, accounts[0], accounts[0], {"from": accounts[0]}
        )

    yield f
