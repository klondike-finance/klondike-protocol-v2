import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH } from "../tasks/utils";
import { deployUniswap } from "./helpers/helpers";

describe("StableFund", () => {
  const INITIAL_MINT = ETH.mul(100);
  let StableFund: ContractFactory;
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
  let stableFund: Contract;

  before(async () => {
    StableFund = await ethers.getContractFactory("StableFund");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    const signers = await ethers.getSigners();
    op = signers[0];
    trader = signers[1];
    other = signers[2];
    another = signers[3];
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
    kwbtc = await SyntheticToken.deploy("KWBTC", "KWBTC", 18);
    wbtc = await SyntheticToken.deploy("WBTC", "WTBC", 18);
    kdai = await SyntheticToken.deploy("KDAI", "KDAI", 18);
    dai = await SyntheticToken.deploy("DAI", "DAI", 18);
    kwbtc.mint(op.address, INITIAL_MINT);
    wbtc.mint(op.address, INITIAL_MINT);
    kdai.mint(op.address, INITIAL_MINT);
    dai.mint(op.address, INITIAL_MINT);
  });
  beforeEach(async () => {
    stableFund = await StableFund.deploy(router.address, [], []);
  });

  describe("#addTrader", () => {
    it("adds trader to traders list", async () => {
      expect(await stableFund.isAllowedTrader(other.address)).to.eq(false);
      await stableFund.addTrader(other.address);
      expect(await stableFund.isAllowedTrader(other.address)).to.eq(true);
    });
    describe("when called not by Operator", () => {
      it("fails", async () => {
        await expect(
          stableFund.connect(other).addTrader(other.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#deleteTrader", () => {
    it("deletes trader from traders list", async () => {
      await stableFund.addTrader(other.address);
      await stableFund.addTrader(another.address);
      expect(await stableFund.isAllowedTrader(other.address)).to.eq(true);
      expect(await stableFund.isAllowedTrader(another.address)).to.eq(true);
      await stableFund.deleteTrader(other.address);
      expect(await stableFund.isAllowedTrader(other.address)).to.eq(false);
      expect(await stableFund.isAllowedTrader(another.address)).to.eq(true);
      await stableFund.deleteTrader(another.address);
      expect(await stableFund.isAllowedTrader(other.address)).to.eq(false);
      expect(await stableFund.isAllowedTrader(another.address)).to.eq(false);
    });
    describe("when called not by Operator", () => {
      it("fails", async () => {
        await expect(
          stableFund.connect(other).deleteTrader(other.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#addToken", () => {
    it("adds token to tokens list", async () => {
      expect(await stableFund.isAllowedToken(kwbtc.address)).to.eq(false);
      await stableFund.addToken(kwbtc.address);
      expect(await stableFund.isAllowedToken(kwbtc.address)).to.eq(true);
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await stableFund.transferOperator(other.address);
        await expect(
          stableFund.connect(other).addToken(kwbtc.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#deleteToken", () => {
    it("deletes token from tokens list", async () => {
      await stableFund.addToken(kwbtc.address);
      await stableFund.addToken(kdai.address);
      expect(await stableFund.isAllowedToken(kwbtc.address)).to.eq(true);
      expect(await stableFund.isAllowedToken(kdai.address)).to.eq(true);
      await stableFund.deleteToken(kwbtc.address);
      expect(await stableFund.isAllowedToken(kwbtc.address)).to.eq(false);
      expect(await stableFund.isAllowedToken(kdai.address)).to.eq(true);
      await stableFund.deleteToken(kdai.address);
      expect(await stableFund.isAllowedToken(kwbtc.address)).to.eq(false);
      expect(await stableFund.isAllowedToken(kdai.address)).to.eq(false);
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        await stableFund.transferOperator(other.address);
        await expect(
          stableFund.connect(other).deleteToken(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#allAllowedTokens", () => {
    it("returns all allowed tokens", async () => {
      await stableFund.addToken(kwbtc.address);
      await stableFund.addToken(kdai.address);
      expect(await stableFund.allAllowedTokens()).to.eql([
        kwbtc.address,
        kdai.address,
      ]);
    });
  });

  describe("#allAllowedTraders", () => {
    it("returns all allowed tokens", async () => {
      await stableFund.addTrader(other.address);
      await stableFund.addTrader(another.address);
      expect(await stableFund.allAllowedTraders()).to.eql([
        other.address,
        another.address,
      ]);
    });
  });

  //   await setupUniswap();
  // });

  // async function setupUniswap() {
  //   const { factory: f, router: r } = await deployUniswap();
  //   const { underlying: u, synthetic: s, pair: p } = await addUniswapPair(
  //     f,
  //     r,
  //     "WBTC",
  //     8,
  //     "KBTC",
  //     18
  //   );

  //   factory = f;
  //   router = r;
  //   underlying = u;
  //   synthetic = s;
  //   pair = p;
  // }
});
