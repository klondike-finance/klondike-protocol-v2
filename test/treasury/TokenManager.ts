import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { Contract, ContractFactory } from "ethers";
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
    describe("when Synthetic token is managed by the Token Manager", () => {
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
    describe("when Synthetic token is not managed by the Token Manager", () => {
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
});
