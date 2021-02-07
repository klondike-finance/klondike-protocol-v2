import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
  addUniswapPair,
  deployToken,
  deployUniswap,
  now,
} from "../helpers/helpers";

describe("TokenManager", () => {
  let TokenManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let factory: Contract;
  let router: Contract;
  let manager: Contract;
  let op: SignerWithAddress;
  let oracle: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    TokenManager = await ethers.getContractFactory("TokenManager");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
  });
  beforeEach(async () => {
    manager = await TokenManager.deploy(factory.address);
  });

  async function addPair(
    underlyingDecimals: number,
    syntheticDecimals: number
  ) {
    const { underlying: u, synthetic: s, pair } = await addUniswapPair(
      factory,
      router,
      "WBTC",
      underlyingDecimals,
      "KBTC",
      syntheticDecimals
    );
    underlying = u;
    synthetic = s;
    oracle = await Oracle.deploy(
      factory.address,
      underlying.address,
      synthetic.address,
      3600,
      await now()
    );
    await underlying.transferOperator(manager.address);
    await underlying.transferOwnership(manager.address);
    await synthetic.transferOperator(manager.address);
    await synthetic.transferOwnership(manager.address);
  }

  describe("#constructor", () => {
    it("creates an instance of TokenManager", async () => {
      await expect(TokenManager.deploy(factory.address)).to.not.be.reverted;
    });
  });

  describe("#isManagedToken", () => {
    describe("when Synthetic token is managed", () => {
      it("returns true", async () => {
        await addPair(8, 18);
        expect(
          await manager.isManagedToken(synthetic.address),
          "Fresh manager shouldn't manage any tokens"
        ).to.eq(false);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        expect(
          await manager.isManagedToken(synthetic.address),
          "Expected to manage synthetic token"
        ).to.eq(true);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("returns false", async () => {
        await addPair(8, 18);
        expect(
          await manager.isManagedToken(synthetic.address),
          "Fresh manager shouldn't manage any tokens"
        ).to.eq(false);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        expect(
          await manager.isManagedToken(underlying.address),
          "Expected to manage synthetic token"
        ).to.eq(false);
      });
    });
  });

  describe("#syntheticDecimals", () => {
    describe("when Synthetic token is managed", () => {
      it("returns number of decimals for synthetic token", async () => {
        await addPair(8, 25);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.syntheticDecimals(synthetic.address)).to.eq(25);
        await addPair(6, 0);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.syntheticDecimals(synthetic.address)).to.eq(0);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.syntheticDecimals(underlying.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#underlyingDecimals", () => {
    describe("when Synthetic token is managed", () => {
      it("returns number of decimals for underlying token", async () => {
        await addPair(8, 25);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.underlyingDecimals(synthetic.address)).to.eq(8);
        await addPair(6, 0);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.underlyingDecimals(synthetic.address)).to.eq(6);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.underlyingDecimals(underlying.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#averagePrice", () => {
    describe("when Synthetic token is managed", () => {
      it("returns oracle average price", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        const managerPrice = await manager.averagePrice(
          synthetic.address,
          BigNumber.from(10).pow(18)
        );
        const oraclePrice = await oracle.consult(
          synthetic.address,
          BigNumber.from(10).pow(18)
        );

        expect(managerPrice).to.eq(oraclePrice);
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.averagePrice(underlying.address, BigNumber.from(10).pow(18))
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });
});
