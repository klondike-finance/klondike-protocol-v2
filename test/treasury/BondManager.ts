import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { assert } from "console";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { UNISWAP_V2_FACTORY_ADDRESS } from "../../tasks/uniswap";
import {
  deployToken,
  deployUniswap,
  addUniswapPair,
  now,
  pairFor,
  BTC,
  fastForwardAndMine,
} from "../helpers/helpers";

describe("BondManager", () => {
  let BondManager: ContractFactory;
  let TokenManager: ContractFactory;
  let EmissionManagerMock: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let manager: Contract;
  let tokenManager: Contract;
  let emissionManager: Contract;
  let factory: Contract;
  let router: Contract;
  let pair: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;
  let oracle: Contract;
  let op: SignerWithAddress;
  const SYNTHETIC_DECIMALS = 13;
  const UNDERLYING_DECIMALS = 10;
  const BOND_DECIMALS = 13;
  const INITIAL_MANAGER_BALANCE = BTC.mul(10);
  before(async () => {
    BondManager = await ethers.getContractFactory("BondManager");
    TokenManager = await ethers.getContractFactory("TokenManager");
    EmissionManagerMock = await ethers.getContractFactory(
      "EmissionManagerMock"
    );
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
    manager = await BondManager.deploy(await now());
    tokenManager = await TokenManager.deploy(factory.address);
    emissionManager = await EmissionManagerMock.deploy();
    await manager.setTokenManager(tokenManager.address);
    await tokenManager.setBondManager(manager.address);
    await tokenManager.setEmissionManager(emissionManager.address);
    const [operator] = await ethers.getSigners();
    op = operator;
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
    await synthetic.mint(manager.address, INITIAL_MANAGER_BALANCE);
    await underlying.transferOperator(tokenManager.address);
    await underlying.transferOwnership(tokenManager.address);
    await synthetic.transferOperator(tokenManager.address);
    await synthetic.transferOwnership(tokenManager.address);
    await bond.transferOperator(manager.address);
    await bond.transferOwnership(manager.address);
    await tokenManager.addToken(
      synthetic.address,
      bond.address,
      underlying.address,
      oracle.address
    );
  }

  describe("#constructor", () => {
    it("creates a bond manager", async () => {
      await expect(BondManager.deploy(await now())).to.not.be.reverted;
    });
  });

  describe("#addBondToken", () => {
    beforeEach(async () => {
      await setupUniswap();
    });

    describe("when synthetic token operator is TokenManager", () => {
      it("adds bond token", async () => {
        const manager = await BondManager.deploy(await now());
        await manager.setTokenManager(op.address);
        const bond = await deployToken(
          SyntheticToken,
          router,
          "KBOND",
          BOND_DECIMALS
        );
        await bond.transferOperator(manager.address);
        await bond.transferOwnership(manager.address);

        await expect(manager.addBondToken(synthetic.address, bond.address))
          .to.emit(manager, "BondAdded")
          .withArgs(bond.address);
        expect(await manager.bondDecimals(synthetic.address)).to.eq(
          BOND_DECIMALS
        );
      });
    });
    describe("when bond token operator is not BondManager", () => {
      it("works", async () => {
        const manager = await BondManager.deploy(await now());
        await manager.setTokenManager(op.address);

        const b = await deployToken(
          SyntheticToken,
          router,
          "KBOND",
          BOND_DECIMALS
        );
        await expect(manager.addBondToken(synthetic.address, b.address)).to.not
          .be.reverted;
      });
    });
    describe("when called not by TokenManager", () => {
      it("fails", async () => {
        const manager = await BondManager.deploy(await now());
        await expect(
          manager.addBondToken(synthetic.address, bond.address)
        ).to.be.revertedWith(
          "BondManager: Only TokenManager can call this function"
        );
      });
    });
  });

  describe("#deleteBondToken", () => {
    describe("when synthetic token operator is TokenManager", () => {
      it("it deletes bond token", async () => {
        await setupUniswap();
        const [_, other] = await ethers.getSigners();
        await manager.setTokenManager(op.address);
        await expect(manager.deleteBondToken(synthetic.address, other.address))
          .to.emit(manager, "BondDeleted")
          .withArgs(bond.address, other.address);
        await expect(
          manager.bondDecimals(synthetic.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
        expect(await bond.operator()).to.eq(other.address);
        expect(await bond.owner()).to.eq(other.address);
        expect(await synthetic.balanceOf(manager.address)).to.eq(0);
        expect(await synthetic.balanceOf(other.address)).to.eq(
          INITIAL_MANAGER_BALANCE
        );
        await manager.setTokenManager(tokenManager.address);
      });
    });
    describe("when called not by TokenManager", () => {
      it("fails", async () => {
        await setupUniswap();
        const [_, other] = await ethers.getSigners();
        await expect(
          manager.deleteBondToken(synthetic.address, other.address)
        ).to.be.revertedWith(
          "BondManager: Only TokenManager can call this function"
        );
      });
    });
  });

  describe("#bondDecimals", () => {
    it("returns decimals of the bond", async () => {
      await setupUniswap();
      expect(await manager.bondDecimals(synthetic.address)).to.eq(
        BOND_DECIMALS
      );
    });
    describe("when token is not managed", () => {
      it("fails", async () => {
        await setupUniswap();
        await expect(
          manager.bondDecimals(underlying.address)
        ).to.be.revertedWith("Token is not managed");
      });
    });
  });

  describe("#bondPriceUndPerUnitSyn", () => {
    it("returns price of one unit of bonds", async () => {
      await setupUniswap();
      expect(await manager.bondPriceUndPerUnitSyn(synthetic.address)).to.eq(
        10 ** UNDERLYING_DECIMALS
      );
      // do some 10 random trades
      for (let i = 0; i < 10; i++) {
        fastForwardAndMine(ethers.provider, 1800);
        const seed = Math.random();
        const synthAmount = BigNumber.from(10)
          .pow(SYNTHETIC_DECIMALS)
          .mul(Math.floor(seed * 10000))
          .div(10000);
        const undAmount = BigNumber.from(10)
          .pow(UNDERLYING_DECIMALS)
          .mul(Math.floor(seed * 10000))
          .div(10000);
        if (seed > 0.5) {
          await router.swapExactTokensForTokens(
            synthAmount,
            0,
            [synthetic.address, underlying.address],
            op.address,
            (await now()) + 1800
          );
        } else {
          await router.swapExactTokensForTokens(
            undAmount,
            0,
            [underlying.address, synthetic.address],
            op.address,
            (await now()) + 1800
          );
        }
        fastForwardAndMine(ethers.provider, 1800);
        await oracle.update();
        const oraclePrice = await oracle.consult(
          synthetic.address,
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS)
        );
        const currentPrice = await tokenManager.currentPrice(
          synthetic.address,
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS)
        );
        expect(await manager.bondPriceUndPerUnitSyn(synthetic.address)).to.eq(
          oraclePrice.gte(currentPrice) ? oraclePrice : currentPrice
        );
      }
    });
    describe("when token is not managed", () => {
      it("fails", async () => {
        await expect(
          manager.bondPriceUndPerUnitSyn(underlying.address)
        ).to.be.revertedWith("Token is not managed");
      });
    });
  });

  describe("#quoteBuyBond", () => {
    it("returns price of bonds for a specific amount of synthetic tokens", async () => {
      await setupUniswap();
      await router.swapExactTokensForTokens(
        BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
        0,
        [synthetic.address, underlying.address],
        op.address,
        (await now()) + 1800
      );

      const unitPrice = await manager.bondPriceUndPerUnitSyn(synthetic.address);
      const price = unitPrice.toNumber() / 10 ** UNDERLYING_DECIMALS;
      const amount = 123;
      expect(
        Math.abs(
          (await manager.quoteBonds(synthetic.address, amount)).toNumber() -
            amount / price
        )
      ).to.lte(1);
    });
    describe("when price is greater than 1", () => {
      it("fails", async () => {
        await setupUniswap();
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(UNDERLYING_DECIMALS),
          0,
          [underlying.address, synthetic.address],
          op.address,
          (await now()) + 1800
        );
        await oracle.update();
        await fastForwardAndMine(ethers.provider, 1000);
        await expect(
          manager.quoteBonds(synthetic.address, 123)
        ).to.be.revertedWith(
          "BondManager: Synthetic price is not eligible for bond emission"
        );
      });
    });
    describe("when token is not managed", () => {
      it("fails", async () => {
        await expect(
          manager.quoteBonds(underlying.address, 1)
        ).to.be.revertedWith("Token is not managed");
      });
    });
  });

  describe("#buyBonds", () => {
    describe("when price is below 1, synthetics are approved to manager, minAmountBondsOut is good, buyBonds is not paused", () => {
      it("burns the underlying and mints a bond", async () => {
        await setupUniswap();
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(tokenManager.address, amount);
        const initialBalance = await bond.balanceOf(op.address);
        const bondAmount = await manager.quoteBonds(synthetic.address, amount);
        await expect(manager.buyBonds(synthetic.address, amount, bondAmount))
          .to.emit(synthetic, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount)
          .and.to.emit(bond, "Transfer")
          .withArgs(ethers.constants.AddressZero, op.address, bondAmount);
        expect(await bond.balanceOf(op.address)).to.eq(
          initialBalance.add(bondAmount)
        );
      });
    });
    describe("when bonds are paused", () => {
      it("fails", async () => {
        await setupUniswap();
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        const initialBalance = await bond.balanceOf(op.address);
        const bondAmount = await manager.quoteBonds(synthetic.address, amount);
        await manager.setPauseBuyBonds(true);
        await expect(
          manager.buyBonds(synthetic.address, amount, bondAmount)
        ).to.be.revertedWith(
          "BondManager: Buying bonds is temporarily suspended"
        );
        await manager.setPauseBuyBonds(false);
      });
    });
    describe("when synthetics are not approved in full to manager", () => {
      it("fails", async () => {
        await setupUniswap();
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(tokenManager.address, amount - 1);
        await expect(
          manager.buyBonds(synthetic.address, amount, 0)
        ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
      });
    });
    describe("when price is above 1", () => {
      it("fails", async () => {
        await setupUniswap();
        await router.swapExactTokensForTokens(
          123,
          0,
          [underlying.address, synthetic.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        await expect(
          manager.buyBonds(synthetic.address, amount, 0)
        ).to.be.revertedWith(
          "BondManager: Synthetic price is not eligible for bond emission"
        );
      });
    });
    describe("when minAmountOut is greater than the actual amount", () => {
      it("fails", async () => {
        await setupUniswap();
        await router.swapExactTokensForTokens(
          BigNumber.from(10).pow(SYNTHETIC_DECIMALS),
          0,
          [synthetic.address, underlying.address],
          op.address,
          (await now()) + 1800
        );

        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        const bondAmount = await manager.quoteBonds(synthetic.address, amount);
        await expect(
          manager.buyBonds(synthetic.address, amount, bondAmount + 1)
        ).to.be.revertedWith(
          "BondManager: number of bonds is less than minAmountBondsOut"
        );
      });
    });
  });

  describe("#sellBonds", () => {
    describe("when there's enough BondManager balance, bonds are approved", () => {
      it("burns the bonds and transfers synthetic", async () => {
        await setupUniswap();
        const amount = 12345;
        await bond.approve(manager.address, amount);
        await expect(manager.sellBonds(synthetic.address, amount, amount))
          .to.emit(bond, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount)
          .and.to.emit(synthetic, "Transfer")
          .withArgs(manager.address, op.address, amount);
      });
    });

    describe("when there's not enough balace", () => {
      it("fails", async () => {
        await setupUniswap();
        const managerBalance = await synthetic.balanceOf(manager.address);
        const opBalance = await bond.balanceOf(op.address);
        assert(managerBalance < opBalance);
        await bond.approve(manager.address, managerBalance + 1);
        await expect(
          manager.sellBonds(
            synthetic.address,
            managerBalance + 1,
            managerBalance + 1
          )
        ).to.be.revertedWith(
          "BondManager: Less than minAmountOfSyntheticOut bonds could be sold"
        );
      });
    });

    describe("when bonds are not approved", () => {
      it("fails", async () => {
        await setupUniswap();
        const amount = 12345;
        await bond.approve(manager.address, amount - 1);
        await expect(
          manager.sellBonds(synthetic.address, amount, amount)
        ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
      });
    });
  });

  describe("#setPauseBuyBonds", () => {
    describe("when called by the Operator", () => {
      it("sets pause on selling bonds", async () => {
        const m = await BondManager.deploy(await now());
        expect(await m.pauseBuyBonds()).to.eq(false);
        await m.setPauseBuyBonds(true);
        expect(await m.pauseBuyBonds()).to.eq(true);
      });
    });
    describe("when called not by the Operator", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await expect(
          manager.connect(other).setPauseBuyBonds(true)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#validTokenPermissions", () => {
    describe("when all synthetic tokens are managed by TokenManager", () => {
      it("returns true", async () => {
        await setupUniswap();
        await setupUniswap();
        const s2 = synthetic;
        await setupUniswap();
        await tokenManager.deleteToken(s2.address, op.address);
        expect(await manager.validTokenPermissions()).to.eq(true);
      });
    });
    describe("when some tokens are not operated by TokenManager", () => {
      it("returns false", async () => {
        const { underlying: u, synthetic: s, pair } = await addUniswapPair(
          factory,
          router,
          "WBTC",
          8,
          "KBTC",
          18
        );
        bond = await deployToken(SyntheticToken, router, "KBond", 18);
        underlying = u;
        synthetic = s;
        oracle = await Oracle.deploy(
          factory.address,
          underlying.address,
          synthetic.address,
          3600,
          await now()
        );
        await tokenManager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.validTokenPermissions()).to.eq(false);
      });
    });
    describe("when some tokens are not owned by TokenManager", () => {
      it("returns false", async () => {
        manager = await BondManager.deploy(await now());
        tokenManager = await TokenManager.deploy(factory.address);
        emissionManager = await EmissionManagerMock.deploy();
        await manager.setTokenManager(tokenManager.address);
        await tokenManager.setBondManager(manager.address);
        await tokenManager.setEmissionManager(emissionManager.address);

        const { underlying: u, synthetic: s, pair } = await addUniswapPair(
          factory,
          router,
          "WBTC",
          8,
          "KBTC",
          18
        );
        bond = await deployToken(SyntheticToken, router, "KBond", 18);
        underlying = u;
        synthetic = s;
        oracle = await Oracle.deploy(
          factory.address,
          underlying.address,
          synthetic.address,
          3600,
          await now()
        );
        await bond.transferOperator(manager.address);

        await tokenManager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.validTokenPermissions()).to.eq(false);
      });
    });
  });

  describe("#migrateBalances", () => {
    describe("when called by Owner", () => {
      it("migrates all bond token balances to the new target", async () => {
        manager = await BondManager.deploy(await now());
        tokenManager = await TokenManager.deploy(factory.address);
        emissionManager = await EmissionManagerMock.deploy();
        await manager.setTokenManager(tokenManager.address);
        await tokenManager.setBondManager(manager.address);
        await tokenManager.setEmissionManager(emissionManager.address);

        await setupUniswap();
        const s1 = synthetic;
        await setupUniswap();
        const s2 = synthetic;
        await setupUniswap();
        const s3 = synthetic;
        await tokenManager.deleteToken(s2.address, op.address);
        const tokenManager2 = await TokenManager.deploy(factory.address);
        const manager2 = await BondManager.deploy(await now());
        const emissionManager2 = await EmissionManagerMock.deploy();
        await tokenManager2.setBondManager(manager2.address);
        await tokenManager2.setEmissionManager(emissionManager2.address);
        await manager2.setTokenManager(manager2.address);

        await expect(
          manager.migrateBalances(
            [s1.address, s3.address, s2.address],
            manager2.address
          )
        )
          .to.emit(manager, "MigratedBalance")
          .withArgs(s1.address, manager2.address, INITIAL_MANAGER_BALANCE)
          .and.to.emit(manager, "MigratedBalance")
          .withArgs(s3.address, manager2.address, INITIAL_MANAGER_BALANCE);

        expect(await s1.balanceOf(manager.address)).to.eq(0);
        expect(await s1.balanceOf(manager2.address)).to.eq(
          INITIAL_MANAGER_BALANCE
        );
        expect(await s2.balanceOf(manager.address)).to.eq(0);
        expect(await s3.balanceOf(manager.address)).to.eq(0);
        expect(await s3.balanceOf(manager2.address)).to.eq(
          INITIAL_MANAGER_BALANCE
        );
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        manager = await BondManager.deploy(await now());
        tokenManager = await TokenManager.deploy(factory.address);
        emissionManager = await EmissionManagerMock.deploy();
        await manager.setTokenManager(tokenManager.address);
        await tokenManager.setBondManager(manager.address);
        await tokenManager.setEmissionManager(emissionManager.address);

        await setupUniswap();
        const manager2 = await TokenManager.deploy(factory.address);
        const bondManager2 = await BondManager.deploy(await now());
        const emissionManager2 = await EmissionManagerMock.deploy();
        await manager2.setBondManager(bondManager2.address);
        await manager2.setEmissionManager(emissionManager2.address);
        await bondManager2.setTokenManager(manager2.address);
        await manager.transferOperator(other.address);

        await expect(
          manager
            .connect(other)
            .migrateBalances([bond.address], manager2.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#migrateOwnership", () => {
    describe("when called by Owner", () => {
      it("migrates bond token ownership and operator to the new target", async () => {
        manager = await BondManager.deploy(await now());
        tokenManager = await TokenManager.deploy(factory.address);
        emissionManager = await EmissionManagerMock.deploy();
        await manager.setTokenManager(tokenManager.address);
        await tokenManager.setBondManager(manager.address);
        await tokenManager.setEmissionManager(emissionManager.address);

        await setupUniswap();
        const s1 = synthetic;
        const b1 = bond;
        await setupUniswap();
        const s2 = synthetic;
        const b2 = bond;
        await setupUniswap();
        const s3 = synthetic;
        const b3 = bond;
        await tokenManager.deleteToken(s2.address, op.address);
        const tokenManager2 = await TokenManager.deploy(factory.address);
        const manager2 = await BondManager.deploy(await now());
        const emissionManager2 = await EmissionManagerMock.deploy();
        await tokenManager2.setBondManager(manager2.address);
        await tokenManager2.setEmissionManager(emissionManager2.address);
        await manager2.setTokenManager(manager2.address);

        await expect(
          manager.migrateOwnership(
            [b1.address, b3.address, b2.address],
            manager2.address
          )
        )
          .to.emit(manager, "MigratedOwnership")
          .withArgs(b1.address, manager2.address)
          .and.to.emit(manager, "MigratedOwnership")
          .withArgs(b3.address, manager2.address);

        expect(await b1.operator()).to.eq(manager2.address);
        expect(await b1.owner()).to.eq(manager2.address);
        expect(await b3.operator()).to.eq(manager2.address);
        expect(await b3.owner()).to.eq(manager2.address);
        expect(await b2.operator()).to.eq(op.address);
        expect(await b2.owner()).to.eq(op.address);
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        manager = await BondManager.deploy(await now());
        tokenManager = await TokenManager.deploy(factory.address);
        emissionManager = await EmissionManagerMock.deploy();
        await manager.setTokenManager(tokenManager.address);
        await tokenManager.setBondManager(manager.address);
        await tokenManager.setEmissionManager(emissionManager.address);

        await setupUniswap();
        const manager2 = await TokenManager.deploy(factory.address);
        const bondManager2 = await BondManager.deploy(await now());
        const emissionManager2 = await EmissionManagerMock.deploy();
        await manager2.setBondManager(bondManager2.address);
        await manager2.setEmissionManager(emissionManager2.address);
        await bondManager2.setTokenManager(manager2.address);
        await manager.transferOperator(other.address);

        await expect(
          manager
            .connect(other)
            .migrateOwnership([bond.address], manager2.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
