import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { deployUniswap, ETH, now, pairFor } from "./helpers/helpers";

describe("StabFund", () => {
  const INITIAL_MINT = ETH.mul(100);
  let StabFund: ContractFactory;
  let SyntheticToken: ContractFactory;
  let op: SignerWithAddress;
  let trader: SignerWithAddress;
  let other: SignerWithAddress;
  let another: SignerWithAddress;
  let kwbtc: Contract;
  let wbtc: Contract;
  let kdai: Contract;
  let dai: Contract;
  let factory: Contract;
  let router: Contract;
  let stabFund: Contract;

  before(async () => {
    StabFund = await ethers.getContractFactory("StabFund");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    const signers = await ethers.getSigners();
    op = signers[0];
    trader = signers[1];
    other = signers[2];
    another = signers[3];
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
  });
  beforeEach(async () => {
    kwbtc = await SyntheticToken.deploy("KWBTC", "KWBTC", 18);
    wbtc = await SyntheticToken.deploy("WBTC", "WTBC", 18);
    kdai = await SyntheticToken.deploy("KDAI", "KDAI", 18);
    dai = await SyntheticToken.deploy("DAI", "DAI", 18);
    kwbtc.mint(op.address, INITIAL_MINT);
    wbtc.mint(op.address, INITIAL_MINT);
    kdai.mint(op.address, INITIAL_MINT);
    dai.mint(op.address, INITIAL_MINT);

    stabFund = await StabFund.deploy(router.address, [], []);
  });

  describe("#addTrader", () => {
    it("adds trader to traders list", async () => {
      expect(await stabFund.isAllowedTrader(other.address)).to.eq(false);
      await stabFund.addTrader(other.address);
      expect(await stabFund.isAllowedTrader(other.address)).to.eq(true);
    });
    describe("when called twice for the same trader", () => {
      it("does nothing", async () => {
        expect(await stabFund.isAllowedTrader(other.address)).to.eq(false);
        await stabFund.addTrader(other.address);
        const allowedTraders = await stabFund.allAllowedTraders();
        expect(await stabFund.isAllowedTrader(other.address)).to.eq(true);
        await stabFund.addTrader(other.address);
        expect(await stabFund.isAllowedTrader(other.address)).to.eq(true);
        expect(await stabFund.allAllowedTraders()).to.eql(allowedTraders);
      });
    });
    describe("when called not by Operator", () => {
      it("fails", async () => {
        await expect(
          stabFund.connect(other).addTrader(other.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#deleteTrader", () => {
    it("deletes trader from traders list", async () => {
      await stabFund.addTrader(other.address);
      await stabFund.addTrader(another.address);
      expect(await stabFund.isAllowedTrader(other.address)).to.eq(true);
      expect(await stabFund.isAllowedTrader(another.address)).to.eq(true);
      await stabFund.deleteTrader(other.address);
      expect(await stabFund.isAllowedTrader(other.address)).to.eq(false);
      expect(await stabFund.isAllowedTrader(another.address)).to.eq(true);
      await stabFund.deleteTrader(another.address);
      expect(await stabFund.isAllowedTrader(other.address)).to.eq(false);
      expect(await stabFund.isAllowedTrader(another.address)).to.eq(false);
    });
    describe("when called not by Operator", () => {
      it("fails", async () => {
        await expect(
          stabFund.connect(other).deleteTrader(other.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#addToken", () => {
    it("adds token to tokens list", async () => {
      expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(false);
      await stabFund.addToken(kwbtc.address);
      expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(true);
    });
    describe("when called twice for the same token", async () => {
      it("adds only one token", async () => {
        expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(false);
        await stabFund.addToken(kwbtc.address);
        const allowedTokens = await stabFund.allAllowedTokens();
        expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(true);
        await stabFund.addToken(kwbtc.address);
        expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(true);
        expect(await stabFund.allAllowedTokens()).to.eql(allowedTokens);
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await stabFund.transferOperator(other.address);
        await expect(
          stabFund.connect(other).addToken(kwbtc.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#deleteToken", () => {
    it("deletes token from tokens list", async () => {
      await stabFund.addToken(kwbtc.address);
      await stabFund.addToken(kdai.address);
      expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(true);
      expect(await stabFund.isAllowedToken(kdai.address)).to.eq(true);
      await stabFund.deleteToken(kwbtc.address);
      expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(false);
      expect(await stabFund.isAllowedToken(kdai.address)).to.eq(true);
      await stabFund.deleteToken(kdai.address);
      expect(await stabFund.isAllowedToken(kwbtc.address)).to.eq(false);
      expect(await stabFund.isAllowedToken(kdai.address)).to.eq(false);
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await stabFund.transferOperator(other.address);
        await expect(
          stabFund.connect(other).deleteToken(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#addVault", () => {
    it("adds vault to vaults list", async () => {
      expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(false);
      await stabFund.addVault(kwbtc.address);
      expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(true);
    });
    describe("when called twice for the same vault", async () => {
      it("adds only one vault", async () => {
        expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(false);
        await stabFund.addVault(kwbtc.address);
        const allowedVaults = await stabFund.allAllowedVaults();
        expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(true);
        await stabFund.addVault(kwbtc.address);
        expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(true);
        expect(await stabFund.allAllowedVaults()).to.eql(allowedVaults);
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await stabFund.transferOperator(other.address);
        await expect(
          stabFund.connect(other).addVault(kwbtc.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#deleteVault", () => {
    it("deletes vault from vaults list", async () => {
      await stabFund.addVault(kwbtc.address);
      await stabFund.addVault(kdai.address);
      expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(true);
      expect(await stabFund.isAllowedVault(kdai.address)).to.eq(true);
      await stabFund.deleteVault(kwbtc.address);
      expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(false);
      expect(await stabFund.isAllowedVault(kdai.address)).to.eq(true);
      await stabFund.deleteVault(kdai.address);
      expect(await stabFund.isAllowedVault(kwbtc.address)).to.eq(false);
      expect(await stabFund.isAllowedVault(kdai.address)).to.eq(false);
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await stabFund.transferOperator(other.address);
        await expect(
          stabFund.connect(other).deleteVault(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#allAllowedTokens", () => {
    it("returns all allowed tokens", async () => {
      await stabFund.addToken(kwbtc.address);
      await stabFund.addToken(kdai.address);
      expect(await stabFund.allAllowedTokens()).to.eql([
        kwbtc.address,
        kdai.address,
      ]);
    });
  });

  describe("#allAllowedTraders", () => {
    it("returns all allowed tokens", async () => {
      await stabFund.addTrader(other.address);
      await stabFund.addTrader(another.address);
      expect(await stabFund.allAllowedTraders()).to.eql([
        other.address,
        another.address,
      ]);
    });
  });

  describe("#allAllowedVaults", () => {
    it("returns all allowed tokens", async () => {
      await stabFund.addVault(other.address);
      await stabFund.addVault(another.address);
      expect(await stabFund.allAllowedVaults()).to.eql([
        other.address,
        another.address,
      ]);
    });
  });

  describe("#approve", () => {
    it("approves StabFund token for trading at Uniswap", async () => {
      await stabFund.addTrader(op.address);
      await stabFund.addToken(kwbtc.address);
      expect(await kwbtc.allowance(stabFund.address, router.address)).to.eq(0);
      await stabFund.approve(kwbtc.address, 123);
      expect(await kwbtc.allowance(stabFund.address, router.address)).to.eq(
        123
      );
    });
    describe("when called not by Trader", () => {
      it("fails", async () => {
        await stabFund.addToken(kwbtc.address);
        await expect(stabFund.approve(kwbtc.address, 123)).to.be.revertedWith(
          "StabFund: Not a trader"
        );
      });
    });
    describe("when token is not allowed", () => {
      it("fails", async () => {
        await stabFund.addTrader(op.address);
        await expect(stabFund.approve(kwbtc.address, 123)).to.be.revertedWith(
          "StabFund: Token is not allowed"
        );
      });
    });
  });

  describe("#swapExactTokensForTokens", () => {
    it("swaps on Uniswap", async () => {
      await stabFund.addToken(wbtc.address);
      await stabFund.addToken(kwbtc.address);
      await stabFund.addTrader(op.address);
      const pair = await ethers.getContractAt(
        "IUniswapV2Pair",
        pairFor(factory.address, wbtc.address, kwbtc.address)
      );
      await wbtc.approve(router.address, ETH);
      await kwbtc.approve(router.address, ETH);
      await router.addLiquidity(
        wbtc.address,
        kwbtc.address,
        ETH,
        ETH,
        ETH,
        ETH,
        op.address,
        (await now()) + 1000000
      );
      const [reserve0, reserve1] = await pair.getReserves();
      const [wbtcReserve, kwbtcReserve] =
        wbtc.address.toLowerCase() < kwbtc.address.toLowerCase()
          ? [reserve0, reserve1]
          : [reserve1, reserve0];
      const amount = BigNumber.from("100000000000000000");
      const expectedWbtcReserve = wbtcReserve.add(amount);
      const expectedKwbtcReserve = wbtcReserve
        .mul(kwbtcReserve)
        .div(expectedWbtcReserve.sub(amount.mul(3).div(1000)))
        .add(1); // off-by-1 error
      const amountOut = kwbtcReserve.sub(expectedKwbtcReserve);
      await stabFund.approve(wbtc.address, amount);
      await wbtc.transfer(stabFund.address, amount);
      await stabFund.swapExactTokensForTokens(
        amount,
        amountOut,
        [wbtc.address, kwbtc.address],
        (await now()) + 1000
      );
      const [reserve10, reserve11] = await pair.getReserves();
      const [wbtcReserve1, kwbtcReserve1] =
        wbtc.address.toLowerCase() < kwbtc.address.toLowerCase()
          ? [reserve10, reserve11]
          : [reserve11, reserve10];
      expect(wbtcReserve1).to.eq(expectedWbtcReserve);
      expect(kwbtcReserve1).to.eq(expectedKwbtcReserve);
    });

    describe("when token is not approved", () => {
      it("fails", async () => {
        await stabFund.addToken(wbtc.address);
        await stabFund.addToken(kwbtc.address);
        await stabFund.addTrader(op.address);
        const pair = await ethers.getContractAt(
          "IUniswapV2Pair",
          pairFor(factory.address, wbtc.address, kwbtc.address)
        );
        await wbtc.approve(router.address, ETH);
        await kwbtc.approve(router.address, ETH);
        await router.addLiquidity(
          wbtc.address,
          kwbtc.address,
          ETH,
          ETH,
          ETH,
          ETH,
          op.address,
          (await now()) + 1000000
        );
        const amount = 123;
        await wbtc.transfer(stabFund.address, amount);
        await expect(
          stabFund.swapExactTokensForTokens(
            amount,
            0,
            [wbtc.address, kwbtc.address],
            (await now()) + 1000
          )
        ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED");
      });
    });

    describe("when not enough balance", () => {
      it("fails", async () => {
        await stabFund.addToken(wbtc.address);
        await stabFund.addToken(kwbtc.address);
        await stabFund.addTrader(op.address);
        const pair = await ethers.getContractAt(
          "IUniswapV2Pair",
          pairFor(factory.address, wbtc.address, kwbtc.address)
        );
        await wbtc.approve(router.address, ETH);
        await kwbtc.approve(router.address, ETH);
        await router.addLiquidity(
          wbtc.address,
          kwbtc.address,
          ETH,
          ETH,
          ETH,
          ETH,
          op.address,
          (await now()) + 1000000
        );
        const amount = 123;
        await stabFund.approve(wbtc.address, amount);
        await expect(
          stabFund.swapExactTokensForTokens(
            amount,
            0,
            [wbtc.address, kwbtc.address],
            (await now()) + 1000
          )
        ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED");
      });
    });

    describe("when called tokens are not whitelisted", () => {
      it("fails", async () => {
        await stabFund.addTrader(op.address);
        const pair = await ethers.getContractAt(
          "IUniswapV2Pair",
          pairFor(factory.address, wbtc.address, kwbtc.address)
        );
        await wbtc.approve(router.address, ETH);
        await kwbtc.approve(router.address, ETH);
        await router.addLiquidity(
          wbtc.address,
          kwbtc.address,
          ETH,
          ETH,
          ETH,
          ETH,
          op.address,
          (await now()) + 1000000
        );
        const amount = 123;
        await wbtc.transfer(stabFund.address, amount);
        await expect(
          stabFund.swapExactTokensForTokens(
            amount,
            0,
            [wbtc.address, kwbtc.address],
            (await now()) + 1000
          )
        ).to.be.revertedWith("StabFund: First token is not allowed");
        await stabFund.addToken(wbtc.address);
        await expect(
          stabFund.swapExactTokensForTokens(
            amount,
            0,
            [wbtc.address, kwbtc.address],
            (await now()) + 1000
          )
        ).to.be.revertedWith("StabFund: Last token is not allowed");
      });
    });

    describe("when called not by Trader", () => {
      it("fails", async () => {
        await stabFund.addToken(wbtc.address);
        await stabFund.addToken(kwbtc.address);
        const pair = await ethers.getContractAt(
          "IUniswapV2Pair",
          pairFor(factory.address, wbtc.address, kwbtc.address)
        );
        await wbtc.approve(router.address, ETH);
        await kwbtc.approve(router.address, ETH);
        await router.addLiquidity(
          wbtc.address,
          kwbtc.address,
          ETH,
          ETH,
          ETH,
          ETH,
          op.address,
          (await now()) + 1000000
        );
        const amount = 123;
        await wbtc.transfer(stabFund.address, amount);
        await expect(
          stabFund.swapExactTokensForTokens(
            amount,
            0,
            [wbtc.address, kwbtc.address],
            (await now()) + 1000
          )
        ).to.be.revertedWith("StabFund: Not a trader");
      });
    });
  });
});
