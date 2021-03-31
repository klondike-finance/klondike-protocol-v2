import pytest

@pytest.fixture(scope="module")
def token(ERC20, accounts):
    yield ERC20.deploy("KlonX", "KlonX", 18, {"from": accounts[0]})

@pytest.fixture(scope="module")
def ve_token(VeToken, accounts, token):
    yield VeToken.deploy(
        token, "Voting-escrowed KlonX", "veKlonX", "veKlonX", {"from": accounts[0]}
    )