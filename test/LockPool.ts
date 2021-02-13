import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { ETH, now } from "./helpers/helpers";

describe("LockPool", () => {
  let op: SignerWithAddress;
  let LockPool: ContractFactory;
  let SyntheticToken: ContractFactory;
  let droid: Contract;
  let jedi: Contract;
  let lockPool: Contract;

  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    LockPool = await ethers.getContractFactory("LockPool");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
  });
  beforeEach(async () => {
    droid = await SyntheticToken.deploy("DROID", "DROID", 18);
    jedi = await SyntheticToken.deploy("JEDI", "JEDI", 18);
    await droid.mint(op.address, ETH.mul(100));
    await jedi.mint(op.address, ETH.mul(100));
    lockPool = await LockPool.deploy(droid.address, jedi.address, await now());
  });

  describe("#constructor", () => {
    it("creates a new LockPool", async () => {
      await expect(LockPool.deploy(droid.address, jedi.address, await now())).to
        .not.be.reverted;
    });
  });
});
