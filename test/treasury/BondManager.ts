import { expect } from "chai";
import { assert } from "console";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { UNISWAP_V2_FACTORY_ADDRESS } from "../../tasks/uniswap";
import {
  deployToken,
  deployUniswap,
  addUniswapPair,
  now,
  pairFor,
} from "../helpers/helpers";

describe("BondManager", () => {
  let BondManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let manager: Contract;
  let factory: Contract;
  let router: Contract;
  let pair: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;
  let oracle: Contract;
  const SYNTHETIC_DECIMALS = 13;
  const UNDERLYING_DECIMALS = 10;
  const BOND_DECIMALS = 17;
  before(async () => {
    BondManager = await ethers.getContractFactory("BondManager");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
    manager = await BondManager.deploy(factory.address);
  });
  async function setupUniswap() {
    const { underlying: u, synthetic: s, pair: p } = await addUniswapPair(
      factory,
      router,
      "WBTC",
      UNDERLYING_DECIMALS,
      "KBTC",
      SYNTHETIC_DECIMALS
    );
    underlying = u;
    synthetic = s;
    pair = p;

    oracle = await Oracle.deploy(
      factory.address,
      underlying.address,
      synthetic.address,
      3600,
      await now()
    );
    bond = await deployToken(SyntheticToken, router, "KBOND", BOND_DECIMALS);
    await underlying.transferOperator(manager.address);
    await underlying.transferOwnership(manager.address);
    await synthetic.transferOperator(manager.address);
    await synthetic.transferOwnership(manager.address);
    await bond.transferOperator(manager.address);
    await bond.transferOwnership(manager.address);
  }

  describe("#constructor", () => {
    it("creates a bond manager", async () => {
      await expect(BondManager.deploy(UNISWAP_V2_FACTORY_ADDRESS)).to.not.be
        .reverted;
    });
  });

  describe("#addToken", () => {
    beforeEach(async () => {
      await setupUniswap();
    });

    describe("when synthetic token operator is TokenManager", () => {
      it("in additinal to TokenManager #addtoken it also adds bond token", async () => {
        await expect(
          manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          )
        )
          .to.emit(manager, "BondAdded")
          .withArgs(bond.address);
        expect(await manager.bondDecimals(synthetic.address)).to.eq(
          BOND_DECIMALS
        );
      });
    });
    describe("when synthetic token operator is not TokenManager", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await expect(
          manager
            .connect(other)
            .addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });
});
