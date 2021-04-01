from collections import defaultdict

from brownie import chain
from brownie.test import strategy

WEEK = 86400 * 7
YEAR = 86400 * 365


class StateMachine:

    st_acct = strategy("address", length=5)
    st_weeks = strategy("uint256", min_value=1, max_value=12)
    st_amount = strategy("decimal", min_value=1, max_value=100, places=3)
    st_time = strategy("uint256", min_value=0, max_value=86400 * 3)

    def __init__(self, distributor, accounts, ve_token, fee_coin, fee2_coin):
        self.distributor = distributor
        self.accounts = accounts
        self.ve_token = ve_token
        self.fee_coin = fee_coin
        self.fee2_coin = fee2_coin

    def setup(self):
        self.locked_until = {
            self.accounts[0]: self.ve_token.locked__end(self.accounts[0])}
        self.fees = {}
        self.fees2 = {}
        self.user_claims = defaultdict(dict)
        self.user2_claims = defaultdict(dict)
        self.total_fees = 10 ** 18
        self.total_fees2 = 10 ** 18

    def _check_active_lock(self, st_acct):
        # check if `st_acct` has an active lock
        if st_acct not in self.locked_until:
            return False

        if self.locked_until[st_acct] < chain.time():
            self.ve_token.withdraw({"from": st_acct})
            del self.locked_until[st_acct]
            return False

        return True

    def initialize_new_lock(self, st_acct, st_amount, st_weeks, st_time):
        """
        Initialize-only rule to make a new lock.
        This is equivalent to `rule_new_lock` to make it more likely we have at
        least 2 accounts locked at the start of the test run.
        """
        self.rule_new_lock(st_acct, st_amount, st_weeks, st_time)

    def initialize_transfer_fees(self, st_amount, st_time):
        """
        Initialize-only rule to transfer fees.
        This is equivalent to `rule_transfer_fees` to make it more likely
        that claimable fees are available from the start of the test.
        """
        self.rule_transfer_fees(st_amount, st_time)

    def rule_new_lock(self, st_acct, st_amount, st_weeks, st_time):
        """
        Add a new user lock.
        Arguments
        ---------
        st_acct : Account
            Account to lock tokens for. If this account already has an active
            lock, the rule is skipped.
        st_amount : decimal
            Amount of tokens to lock.
        st_weeks : int
            Duration of lock, given in weeks.
        st_time : int
            Duration to sleep before action, in seconds.
        """
        chain.sleep(st_time)

        if not self._check_active_lock(st_acct):
            until = ((chain.time() // WEEK) + st_weeks) * WEEK
            self.ve_token.create_lock(
                int(st_amount * 10 ** 18), until, {"from": st_acct})
            self.locked_until[st_acct] = until

    def rule_extend_lock(self, st_acct, st_weeks, st_time):
        """
        Extend an existing user lock.
        Arguments
        ---------
        st_acct : Account
            Account to extend lock for. If this account does not have an active
            lock, the rule is skipped.
        st_weeks : int
            Duration to extend the lock, given in weeks.
        st_time : int
            Duration to sleep before action, in seconds.
        """
        chain.sleep(st_time)

        if self._check_active_lock(st_acct):
            until = ((self.locked_until[st_acct] // WEEK) + st_weeks) * WEEK
            until = min(until, (chain.time() + YEAR * 4) // WEEK * WEEK)

            self.ve_token.increase_unlock_time(until, {"from": st_acct})
            self.locked_until[st_acct] = until

    def rule_increase_lock_amount(self, st_acct, st_amount, st_time):
        """
        Increase the amount of an existing user lock.
        Arguments
        ---------
        st_acct : Account
            Account to increase lock amount for. If this account does not have an
            active lock, the rule is skipped.
        st_amount : decimal
            Amount of tokens to add to lock.
        st_time : int
            Duration to sleep before action, in seconds.
        """
        chain.sleep(st_time)

        if self._check_active_lock(st_acct):
            self.ve_token.increase_amount(
                int(st_amount * 10 ** 18), {"from": st_acct})

    def rule_claim_fees(self, st_acct, st_time):
        """
        Claim fees for a user.
        Arguments
        ---------
        st_acct : Account
            Account to claim fees for.
        st_time : int
            Duration to sleep before action, in seconds.
        """
        chain.sleep(st_time)

        claimed = self.fee_coin.balanceOf(st_acct)

        tx = self.distributor.claim({"from": st_acct})

        claimed = self.fee_coin.balanceOf(st_acct) - claimed
        self.user_claims[st_acct][tx.timestamp] = (
            claimed,
            self.distributor.time_cursor_of(st_acct),
        )

        claimed = self.fee2_coin.balanceOf(st_acct)

        tx = self.distributor.claim({"from": st_acct})

        claimed = self.fee2_coin.balanceOf(st_acct) - claimed
        self.user2_claims[st_acct][tx.timestamp] = (
            claimed,
            self.distributor.time_cursor_of(st_acct),
        )

    def rule_transfer_fees(self, st_amount, st_time):
        """
        Transfer fees into the distributor and make a checkpoint.
        If this is the first checkpoint, `can_checkpoint_token` is also
        enabled.
        Arguments
        ---------
        st_amount : decimal
            Amount of fee tokens to add to the distributor.
        st_time : int
            Duration to sleep before action, in seconds.
        """
        chain.sleep(st_time)

        amount = int(st_amount * 10 ** 18)
        tx = self.fee_coin._mint_for_testing(
            amount, {"from": self.distributor.address})

        if not self.distributor.can_checkpoint_token():
            self.distributor.toggle_allow_checkpoint_token()
            self.distributor.checkpoint_token(self.fee_coin)

        self.fees[tx.timestamp] = amount
        self.total_fees += amount

        amount = int(st_amount * 10 ** 18)
        tx = self.fee2_coin._mint_for_testing(
            amount, {"from": self.distributor.address})

        if not self.distributor.can_checkpoint_token():
            self.distributor.toggle_allow_checkpoint_token()
            self.distributor.checkpoint_token(self.fee2_coin)

        self.fees2[tx.timestamp] = amount
        self.total_fees2 += amount

    def rule_transfer_fees_without_checkpoint(self, st_amount, st_time):
        """
        Transfer fees into the distributor without checkpointing.
        Arguments
        ---------
        st_amount : decimal
            Amount of fee tokens to add to the distributor.
        st_time : int
            Duration to sleep before action, in seconds.
        """
        chain.sleep(st_time)

        amount = int(st_amount * 10 ** 18)
        tx = self.fee_coin._mint_for_testing(
            amount, {"from": self.distributor.address})

        self.fees[tx.timestamp] = amount
        self.total_fees += amount

        amount = int(st_amount * 10 ** 18)
        tx = self.fee2_coin._mint_for_testing(
            amount, {"from": self.distributor.address})

        self.fees2[tx.timestamp] = amount
        self.total_fees2 += amount

    def teardown(self):
        """
        Claim fees for all accounts and verify that only dust remains.
        """
        if not self.distributor.can_checkpoint_token():
            # if no token checkpoint occured, add 100,000 tokens prior to teardown
            self.rule_transfer_fees(100000, 0)

        # Need two checkpoints to get tokens fully distributed
        # Because tokens for current week are obtained in the next week
        # And that is by design
        self.distributor.checkpoint_token(self.fee_coin)
        self.distributor.checkpoint_token(self.fee2_coin)
        chain.sleep(WEEK * 2)
        self.distributor.checkpoint_token(self.fee_coin)
        self.distributor.checkpoint_token(self.fee2_coin)

        for acct in self.accounts:
            self.distributor.claim(self.fee_coin, {"from": acct})
            self.distributor.claim(self.fee2_coin, {"from": acct})

        t0 = self.distributor.start_time(self.fee_coin)
        t1 = chain[-1].timestamp // WEEK * WEEK
        tokens_per_user_per_week = {
            acct: [
                self.distributor.tokens_per_week(self.fee_coin, w)
                * self.distributor.ve_for_at(acct, w)
                // self.distributor.ve_supply(w)
                for w in range(t0, t1 + WEEK, WEEK)
            ]
            for acct in self.accounts[:5]
        }

        for acct in self.accounts:
            assert sum(
                tokens_per_user_per_week[acct]) == self.fee_coin.balanceOf(acct)

        assert self.fee_coin.balanceOf(self.distributor) < 100

        t0 = self.distributor.start_time(self.fee2_coin)
        t1 = chain[-1].timestamp // WEEK * WEEK
        tokens_per_user_per_week = {
            acct: [
                self.distributor.tokens_per_week(self.fee2_coin, w)
                * self.distributor.ve_for_at(acct, w)
                // self.distributor.ve_supply(w)
                for w in range(t0, t1 + WEEK, WEEK)
            ]
            for acct in self.accounts[:5]
        }

        for acct in self.accounts:
            assert sum(
                tokens_per_user_per_week[acct]) == self.fee2_coin.balanceOf(acct)

        assert self.fee2_coin.balanceOf(self.distributor) < 100


def test_stateful(state_machine, accounts, ve_token, ve_boardroom, coin_a, coin_b, coin_c, token):
    for i in range(5):
        # ensure accounts[:5] all have tokens that may be locked
        token.approve(ve_token, 2 ** 256 - 1, {"from": accounts[i]})
        token.transfer(accounts[i], 10 ** 18 * 10000000, {"from": accounts[0]})

    # accounts[0] locks 10,000,000 tokens for 2 years - longer than the maximum duration of the test
    ve_token.create_lock(
        10 ** 18 * 10000000, chain.time() + YEAR * 2, {"from": accounts[0]})

    # a week later we deploy the fee distributor
    chain.sleep(WEEK)
    distributor = ve_boardroom()
    distributor.add_token(coin_a, chain.time())
    distributor.add_token(coin_c, chain.time())
    distributor.add_token(coin_b, chain.time())
    distributor.delete_token(coin_c)

    state_machine(
        StateMachine,
        distributor,
        accounts[:5],
        ve_token,
        coin_a,
        coin_b,
        settings={"stateful_step_count": 30},
    )
