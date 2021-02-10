import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { deployUniswap, now } from "../helpers/helpers";

describe("EmissionManager", () => {
  const PERIOD = 86400;
  let TokenManager: ContractFactory;
  let BondManager: ContractFactory;
  let EmissionManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let BoardroomMock: ContractFactory;
  let factory: Contract;
  let router: Contract;
  let manager: Contract;
  let bondManager: Contract;
  let tokenManager: Contract;
  let boardroomMock: Contract;
  let op: SignerWithAddress;
  let oracle: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;

  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    TokenManager = await ethers.getContractFactory("TokenManager");
    BondManager = await ethers.getContractFactory("BondManager");
    EmissionManager = await ethers.getContractFactory("EmissionManager");
    BoardroomMock = await ethers.getContractFactory("BoardroomMock");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    BoardroomMock = await ethers.getContractFactory("BoardroomMock");
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
  });
  beforeEach(async () => {
    tokenManager = await TokenManager.deploy(factory.address);
    bondManager = await BondManager.deploy(await now());
    manager = await EmissionManager.deploy(await now(), PERIOD);
    boardroomMock = await BoardroomMock.deploy();
    await tokenManager.setBondManager(bondManager.address);
    await tokenManager.setEmissionManager(manager.address);
    await bondManager.setTokenManager(manager.address);
    await manager.setTokenManager(tokenManager.address);
    await manager.setBondManager(bondManager.address);
    await manager.setBoardroom(boardroomMock.address);
    await manager.setStableFund(op.address);
    await manager.setDevFund(op.address);
  });

  describe("#isInitialized", () => {
    describe("when all parameters are set", () => {
      it("returns true", async () => {
        await manager.setDevFundRate(2);
        await manager.setStableFundRate(70);
        await manager.setThreshold(105);
        expect(await manager.isInitialized()).to.eq(true);
      });
    });
    describe("when some parameters are not set", () => {
      it("returns false", async () => {
        await manager.setDevFundRate(2);
        await manager.setThreshold(105);
        expect(await manager.isInitialized()).to.eq(false);
      });
    });
  });
});
