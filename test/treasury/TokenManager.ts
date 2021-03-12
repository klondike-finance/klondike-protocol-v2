import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import {
  addUniswapPair,
  deployToken,
  deployUniswap,
  now,
  fastForwardAndMine,
  pairFor,
} from "../helpers/helpers";
import { BTC, ETH } from "../../tasks/utils";

describe("TokenManager", () => {
  let TokenManager: ContractFactory;
  let SyntheticToken: ContractFactory;
  let Oracle: ContractFactory;
  let BondManager: ContractFactory;
  let EmissionManagerMock: ContractFactory;
  let factory: Contract;
  let router: Contract;
  let manager: Contract;
  let bondManager: Contract;
  let emissionManager: Contract;
  let op: SignerWithAddress;
  let oracle: Contract;
  let underlying: Contract;
  let synthetic: Contract;
  let bond: Contract;
  before(async () => {
    const [operator] = await ethers.getSigners();
    op = operator;
    TokenManager = await ethers.getContractFactory("TokenManager");
    SyntheticToken = await ethers.getContractFactory("SyntheticToken");
    Oracle = await ethers.getContractFactory("Oracle");
    BondManager = await ethers.getContractFactory("BondManager");
    EmissionManagerMock = await ethers.getContractFactory(
      "EmissionManagerMock"
    );
    const { factory: f, router: r } = await deployUniswap();
    factory = f;
    router = r;
  });
  beforeEach(async () => {
    manager = await TokenManager.deploy(factory.address);
    bondManager = await BondManager.deploy(await now());
    emissionManager = await EmissionManagerMock.deploy();
    await manager.setBondManager(bondManager.address);
    await manager.setEmissionManager(emissionManager.address);
    await bondManager.setTokenManager(manager.address);
  });

  async function addPair(
    underlyingDecimals: number,
    syntheticDecimals: number,
    bondDecimals?: number,
    mintSynth: number = 0
  ) {
    const bondDecs = bondDecimals || syntheticDecimals;
    const { underlying: u, synthetic: s, pair } = await addUniswapPair(
      factory,
      router,
      "WBTC",
      underlyingDecimals,
      "KBTC",
      syntheticDecimals
    );
    bond = await deployToken(SyntheticToken, router, "KBond", bondDecs);
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
    await synthetic.mint(manager.address, mintSynth);
    await synthetic.transferOperator(manager.address);
    await synthetic.transferOwnership(manager.address);
    await bond.transferOperator(bondManager.address);
    await bond.transferOwnership(bondManager.address);
  }

  async function doSomeTrading() {
    await oracle.update();
    await fastForwardAndMine(ethers.provider, 100);
    await router.swapExactTokensForTokens(
      ETH.div(1000),
      BTC.div(1000).div(2),
      [synthetic.address, underlying.address],
      op.address,
      (await now()) + 1800
    );

    await fastForwardAndMine(ethers.provider, 100);
    await router.swapExactTokensForTokens(
      ETH.div(1000).div(2),
      BTC.div(1000).div(5),
      [synthetic.address, underlying.address],
      op.address,
      (await now()) + 1800
    );
    await fastForwardAndMine(ethers.provider, 3400);
    await oracle.update();
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
          bond.address,
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
          bond.address,
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

  describe("#averagePrice", () => {
    describe("when Synthetic token is managed", () => {
      it("returns oracle average price", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await doSomeTrading();
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
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.averagePrice(underlying.address, BigNumber.from(10).pow(18))
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#currentPrice", () => {
    describe("when Synthetic token is managed", () => {
      it("returns current uniswap price", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await doSomeTrading();
        const managerPrice = await manager.currentPrice(synthetic.address, ETH);
        const pairAddress = pairFor(
          factory.address,
          synthetic.address,
          underlying.address
        );
        const pair = await ethers.getContractAt("IUniswapV2Pair", pairAddress);
        const [reserve0, reserve1] = await pair.getReserves();
        const [reserveUnderlying, reserveSynthetic] =
          synthetic.address.toLowerCase() < underlying.address.toLowerCase()
            ? [reserve1, reserve0]
            : [reserve0, reserve1];
        const currentPrice = reserveUnderlying.mul(ETH).div(reserveSynthetic);
        expect(managerPrice).to.eq(currentPrice);
      });

      describe("when amount is 0", () => {
        it("fails", async () => {
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          await expect(
            manager.currentPrice(synthetic.address, 0)
          ).to.be.revertedWith("UniswapV2Library: INSUFFICIENT_AMOUNT");
        });
      });
    });
    describe("when Synthetic token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.currentPrice(underlying.address, BigNumber.from(10).pow(18))
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });

    describe("#addToken", () => {
      describe("when tokens are different and oracle tracks the pair", () => {
        it("adds the token pair", async () => {
          await addPair(8, 18);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          )
            .to.emit(manager, "TokenAdded")
            .withArgs(
              ethers.utils.getAddress(synthetic.address),
              ethers.utils.getAddress(underlying.address),
              ethers.utils.getAddress(oracle.address),
              ethers.utils.getAddress(
                pairFor(factory.address, synthetic.address, underlying.address)
              )
            )
            .and.to.emit(bondManager, "BondAdded")
            .withArgs(bond.address);
          expect(await manager.isManagedToken(synthetic.address)).to.eq(true);
          expect(await manager.tokens(0)).to.eq(synthetic.address);
          await expect(manager.tokens(1)).to.be.reverted;

          const oldSynth = synthetic;

          await addPair(8, 18);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.not.be.reverted;
          expect(await manager.isManagedToken(synthetic.address)).to.eq(true);
          expect(await manager.tokens(0)).to.eq(oldSynth.address);
          expect(await manager.tokens(1)).to.eq(synthetic.address);
          await expect(manager.tokens(2)).to.be.reverted;
        });
      });
      describe("when BondManager is not initialized", () => {
        it("fails", async () => {
          await addPair(8, 18);
          await manager.setBondManager(ethers.constants.AddressZero);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: BondManager or EmissionManager is not initialized"
          );
        });
      });
      describe("when tokens are the same", () => {
        it("fails", async () => {
          await addPair(8, 18);

          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              synthetic.address,
              oracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Synthetic token and Underlying tokens must be different"
          );
        });
      });
      describe("when synthetic decimals doesn't equal to bond decimals", () => {
        it("fails", async () => {
          await addPair(8, 18, 15);

          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Synthetic and Bond tokens must have the same number of decimals"
          );
        });
      });

      describe("when token already exists", () => {
        it("fails", async () => {
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.be.revertedWith("TokenManager: Token is already managed");
        });
      });

      describe("when oracle doesn't conform to IOracle interface", () => {
        it("fails", async () => {
          await addPair(8, 18);

          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              synthetic.address
            )
          ).to.be.reverted;
        });
      });
      describe("when oracle doesn't match tokens", () => {
        it("fails", async () => {
          await addPair(8, 18);
          const oldOracle = oracle;
          await addPair(8, 18);
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oldOracle.address
            )
          ).to.be.revertedWith(
            "TokenManager: Tokens and Oracle tokens are different"
          );
        });
      });
      describe("when synthetic token operator is not TokenManager", () => {
        it("works", async () => {
          const { underlying: u, synthetic: s, pair } = await addUniswapPair(
            factory,
            router,
            "WBTC",
            8,
            "KBTC",
            18
          );
          underlying = u;
          synthetic = s;
          bond = await deployToken(SyntheticToken, router, "KBond", 18);
          await bond.transferOperator(manager.address);
          await bond.transferOwnership(manager.address);
          oracle = await Oracle.deploy(
            factory.address,
            underlying.address,
            synthetic.address,
            3600,
            await now()
          );
          await expect(
            manager.addToken(
              synthetic.address,
              bond.address,
              underlying.address,
              oracle.address
            )
          ).to.not.be.reverted;
        });
      });
      describe("when caller is not operator", () => {
        it("fails", async () => {
          const [op, other] = await ethers.getSigners();
          await addPair(8, 18);
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
    describe("#deleteToken", () => {
      describe("when Synthetic token is managed", () => {
        it("is deleted and operator is transferred to target", async () => {
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          const s1 = synthetic;
          const o1 = oracle;
          const u1 = underlying;
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          const s2 = synthetic;
          await expect(manager.deleteToken(s1.address, op.address))
            .to.emit(manager, "TokenDeleted")
            .withArgs(
              ethers.utils.getAddress(s1.address),
              ethers.utils.getAddress(u1.address),
              ethers.utils.getAddress(o1.address),
              ethers.utils.getAddress(
                pairFor(factory.address, s1.address, u1.address)
              )
            );
          expect(await manager.isManagedToken(s1.address)).to.eq(false);
          expect(await manager.isManagedToken(s2.address)).to.eq(true);
          expect(await manager.tokens(0)).to.eq(ethers.constants.AddressZero);
          expect(await manager.tokens(1)).to.eq(s2.address);
          expect(await s1.operator()).to.eq(op.address);
          expect(await s1.owner()).to.eq(op.address);
        });
      });
      describe("when caller is not operator", () => {
        it("fails", async () => {
          const [op, other] = await ethers.getSigners();
          await addPair(8, 18);
          await manager.addToken(
            synthetic.address,
            bond.address,
            underlying.address,
            oracle.address
          );
          await expect(
            manager.connect(other).deleteToken(synthetic.address, op.address)
          ).to.be.revertedWith("Only operator can call this method");
        });
      });
    });
  });

  describe("#isInitialized", () => {
    describe("when BondManager and TokenManager are set", () => {
      it("returns true", async () => {
        const manager = await TokenManager.deploy(factory.address);
        await manager.setBondManager(bondManager.address);
        await manager.setEmissionManager(emissionManager.address);
        expect(await manager.isInitialized()).to.eq(true);
      });
    });
    describe("when either BondManager or TokenManager not set", () => {
      it("returns false", async () => {
        let manager = await TokenManager.deploy(factory.address);
        expect(await manager.isInitialized()).to.eq(false);

        manager = await TokenManager.deploy(factory.address);
        await manager.setBondManager(bondManager.address);
        expect(await manager.isInitialized()).to.eq(false);

        manager = await TokenManager.deploy(factory.address);
        await manager.setEmissionManager(emissionManager.address);
        expect(await manager.isInitialized()).to.eq(false);
      });
    });
  });

  describe("#setBondManager", () => {
    describe("when called by Operator", () => {
      it("updates BondManager", async () => {
        const manager = await TokenManager.deploy(factory.address);
        expect(await manager.bondManager()).to.eq(ethers.constants.AddressZero);
        await manager.setBondManager(bondManager.address);
        expect(await manager.bondManager()).to.eq(bondManager.address);
      });
    });
    describe("when called twice", () => {
      it("fails", async () => {
        const manager = await TokenManager.deploy(factory.address);
        expect(await manager.bondManager()).to.eq(ethers.constants.AddressZero);
        await manager.setBondManager(bondManager.address);
        await expect(
          manager.setBondManager(bondManager.address)
        ).to.be.revertedWith(
          "TokenManager: bondManager with this address already set"
        );
      });
    });

    describe("when called by not Operator", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        const manager = await TokenManager.deploy(factory.address);
        await expect(
          manager.connect(other).setBondManager(bondManager.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#setEmissionManager", () => {
    describe("when called by Operator", () => {
      it("updates EmissionManager", async () => {
        const manager = await TokenManager.deploy(factory.address);
        expect(await manager.emissionManager()).to.eq(
          ethers.constants.AddressZero
        );
        await manager.setEmissionManager(emissionManager.address);
        expect(await manager.emissionManager()).to.eq(emissionManager.address);
      });
    });
    describe("when called twice", () => {
      it("fails", async () => {
        const manager = await TokenManager.deploy(factory.address);
        expect(await manager.emissionManager()).to.eq(
          ethers.constants.AddressZero
        );
        await manager.setEmissionManager(emissionManager.address);
        await expect(
          manager.setEmissionManager(emissionManager.address)
        ).to.be.revertedWith(
          "TokenManager: emissionManager with this address already set"
        );
      });
    });

    describe("when called by not Operator", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        const manager = await TokenManager.deploy(factory.address);
        await expect(
          manager.connect(other).setEmissionManager(emissionManager.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#setOracle", () => {
    describe("when synthetic token is managed, oracle manages correct pair of tokens, called by Operator", () => {
      it("updates the oracle", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const oracle2 = await Oracle.deploy(
          factory.address,
          underlying.address,
          synthetic.address,
          3600,
          await now()
        );
        await manager.setOracle(synthetic.address, oracle2.address);
        expect((await manager.tokenIndex(synthetic.address)).oracle).to.eq(
          oracle2.address
        );
      });
    });
    describe("when oracle's tokens differ", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const synOld = synthetic;
        await addPair(8, 18);
        const oracle2 = await Oracle.deploy(
          factory.address,
          underlying.address,
          synthetic.address,
          3600,
          await now()
        );
        await expect(
          manager.setOracle(synOld.address, oracle2.address)
        ).to.be.revertedWith(
          "TokenManager: Tokens and Oracle tokens are different"
        );
      });
    });
    describe("token is not managed", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const oracle2 = await Oracle.deploy(
          factory.address,
          underlying.address,
          synthetic.address,
          3600,
          await now()
        );
        await expect(
          manager.setOracle(underlying.address, oracle2.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });

    describe("when called not by Operator", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const oracle2 = await Oracle.deploy(
          factory.address,
          underlying.address,
          synthetic.address,
          3600,
          await now()
        );

        await expect(
          manager.connect(other).setOracle(synthetic.address, oracle2.address)
        ).to.be.revertedWith("Only operator can call this method");
      });
    });
  });

  describe("#burnSyntheticFrom", () => {
    describe("when called by BondManager and token is approved to TokenManager", () => {
      it("burns syntetic token", async () => {
        const [_, other, another] = await ethers.getSigners();
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await manager.setBondManager(op.address);
        const balance = await synthetic.balanceOf(op.address);
        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        await expect(
          manager.burnSyntheticFrom(synthetic.address, op.address, amount)
        )
          .to.emit(synthetic, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount);
        expect(await synthetic.balanceOf(op.address)).to.eq(
          balance.sub(amount)
        );
        await manager.setBondManager(other.address);
        await synthetic.approve(manager.address, amount);
        await expect(
          manager
            .connect(other)
            .burnSyntheticFrom(synthetic.address, op.address, amount)
        )
          .to.emit(synthetic, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount);
        await manager.addTokenAdmin(another.address);
        await synthetic.approve(manager.address, amount);
        await expect(
          manager
            .connect(another)
            .burnSyntheticFrom(synthetic.address, op.address, amount)
        )
          .to.emit(synthetic, "Transfer")
          .withArgs(op.address, ethers.constants.AddressZero, amount);
        await manager.setBondManager(bondManager.address);
      });
    });
    describe("when token in not approved in full", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await manager.setBondManager(op.address);
        const amount = 12345;
        await synthetic.approve(manager.address, amount - 1);
        await expect(
          manager.burnSyntheticFrom(synthetic.address, op.address, amount)
        ).to.be.revertedWith("ERC20: burn amount exceeds allowance");
      });
    });
    describe("when called not by BondManager", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const amount = 12345;
        await synthetic.approve(manager.address, amount);
        await expect(
          manager.burnSyntheticFrom(synthetic.address, op.address, amount)
        ).to.be.revertedWith("TokenManager: Must be called by token admin");
      });
    });
  });

  describe("#allTokens", () => {
    it("returns all tokens under management", async () => {
      const tokens = [];
      await addPair(8, 18);
      tokens.push(synthetic.address);
      await manager.addToken(
        synthetic.address,
        bond.address,
        underlying.address,
        oracle.address
      );
      await addPair(8, 18);
      tokens.push(synthetic.address);
      await manager.addToken(
        synthetic.address,
        bond.address,
        underlying.address,
        oracle.address
      );
      await addPair(8, 18);
      tokens.push(synthetic.address);
      await manager.addToken(
        synthetic.address,
        bond.address,
        underlying.address,
        oracle.address
      );
      await manager.deleteToken(tokens[1], op.address);
      expect(await manager.allTokens()).to.eql([
        tokens[0],
        ethers.constants.AddressZero,
        tokens[2],
      ]);
    });
  });

  describe("#underlyingToken", () => {
    describe("when synthetic token is under management", () => {
      it("returns underlying token", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        expect(await manager.underlyingToken(synthetic.address)).to.eq(
          underlying.address
        );
      });
    });
    describe("when synthetic token is not under management", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.underlyingToken(underlying.address)
        ).to.be.revertedWith("TokenManager: Token is not managed");
      });
    });
  });

  describe("#mintSynthetic", () => {
    describe("when called by EmissionManager", () => {
      it("mints synthetic token", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const amount = 12345;
        const balance = await synthetic.balanceOf(op.address);
        await manager.setEmissionManager(op.address);
        await expect(
          manager.mintSynthetic(synthetic.address, op.address, amount)
        )
          .to.emit(synthetic, "Transfer")
          .withArgs(ethers.constants.AddressZero, op.address, amount);
        expect(await synthetic.balanceOf(op.address)).to.eq(
          balance.add(amount)
        );
        await manager.setEmissionManager(emissionManager.address);
      });
    });
    describe("when called by BondManager", () => {
      it("mints synthetic token", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const amount = 12345;
        const balance = await synthetic.balanceOf(op.address);
        await manager.setBondManager(op.address);
        await expect(
          manager.mintSynthetic(synthetic.address, op.address, amount)
        )
          .to.emit(synthetic, "Transfer")
          .withArgs(ethers.constants.AddressZero, op.address, amount);
        expect(await synthetic.balanceOf(op.address)).to.eq(
          balance.add(amount)
        );
        await manager.setBondManager(bondManager.address);
      });
    });

    describe("when called by tokenAdmin", () => {
      it("mints synthetic token", async () => {
        const [_, other] = await ethers.getSigners();
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const amount = 12345;
        const balance = await synthetic.balanceOf(op.address);
        await expect(
          manager
            .connect(other)
            .mintSynthetic(synthetic.address, op.address, amount)
        ).to.be.revertedWith("TokenManager: Must be called by token admin");
        await manager.addTokenAdmin(other.address);
        await expect(
          manager
            .connect(other)
            .mintSynthetic(synthetic.address, op.address, amount)
        )
          .to.emit(synthetic, "Transfer")
          .withArgs(ethers.constants.AddressZero, op.address, amount);
        expect(await synthetic.balanceOf(op.address)).to.eq(
          balance.add(amount)
        );
      });
    });

    describe("when called not by EmissionManager or BondManager", () => {
      it("fails", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await expect(
          manager.mintSynthetic(synthetic.address, op.address, 123)
        ).to.be.revertedWith("TokenManager: Must be called by token admin");
      });
    });
  });

  describe("#validTokenPermissions", () => {
    describe("when all synthetic tokens are managed by TokenManager", () => {
      it("returns true", async () => {
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s2 = synthetic;
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        await manager.deleteToken(s2.address, op.address);
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
        await underlying.transferOperator(manager.address);
        await underlying.transferOwnership(manager.address);
        await manager.addToken(
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
        await underlying.transferOperator(manager.address);
        await underlying.transferOwnership(manager.address);
        await synthetic.transferOperator(manager.address);

        await manager.addToken(
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
      it("migrates all token balances to the new target", async () => {
        const [_, other] = await ethers.getSigners();
        const amount = 12345;
        await addPair(8, 18, 18, amount);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s1 = synthetic;
        await addPair(8, 18, 18, amount);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s2 = synthetic;
        await addPair(8, 18, 18, amount);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s3 = synthetic;
        await manager.deleteToken(s2.address, op.address);

        await expect(
          manager.migrateBalances(
            [s2.address, s3.address, s1.address],
            other.address
          )
        )
          .to.emit(manager, "MigratedBalance")
          .withArgs(op.address, s1.address, other.address, amount)
          .and.to.emit(manager, "MigratedBalance")
          .withArgs(op.address, s2.address, other.address, amount)
          .and.to.emit(manager, "MigratedBalance")
          .withArgs(op.address, s3.address, other.address, amount);
        expect(await s1.balanceOf(manager.address)).to.eq(0);
        expect(await s2.balanceOf(manager.address)).to.eq(0);
        expect(await s3.balanceOf(manager.address)).to.eq(0);
        expect(await s1.balanceOf(other.address)).to.eq(amount);
        expect(await s2.balanceOf(other.address)).to.eq(amount);
        expect(await s3.balanceOf(other.address)).to.eq(amount);
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
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
            .migrateBalances([synthetic.address], manager2.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#migrateOwnership", () => {
    describe("when called by Owner", () => {
      it("migrates all token ownerships and operators to the new target", async () => {
        const [_, other] = await ethers.getSigners();
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s1 = synthetic;
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s2 = synthetic;
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
        const s3 = synthetic;
        await manager.deleteToken(s2.address, op.address);

        await expect(
          manager.migrateOwnership(
            [s2.address, s3.address, s1.address],
            other.address
          )
        )
          .to.emit(manager, "MigratedOwnership")
          .withArgs(op.address, s1.address, other.address)
          .and.to.emit(manager, "MigratedOwnership")
          .withArgs(op.address, s3.address, other.address);
        expect(await s1.operator()).to.eq(other.address);
        expect(await s2.operator()).to.eq(op.address);
        expect(await s3.operator()).to.eq(other.address);
        expect(await s1.owner()).to.eq(other.address);
        expect(await s2.owner()).to.eq(op.address);
        expect(await s3.owner()).to.eq(other.address);
      });
    });
    describe("when called not by Owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await addPair(8, 18);
        await manager.addToken(
          synthetic.address,
          bond.address,
          underlying.address,
          oracle.address
        );
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
            .migrateOwnership([synthetic.address], manager2.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("allTokenAdmins", () => {
    describe("when initialized", () => {
      it("consists of bondManager and emissionManager", async () => {
        const admins = Array.from(await manager.allTokenAdmins());
        expect(admins.sort()).to.eql(
          [bondManager.address, emissionManager.address].sort()
        );
      });
    });
  });
  describe("#deleteTokenAdmin", () => {
    describe("when token address is not in the admins list", () => {
      it("does nothing", async () => {
        const [_, other] = await ethers.getSigners();
        const admins1 = await manager.allTokenAdmins();
        expect(admins1.length).to.eq(2);
        await manager.deleteTokenAdmin(other.address);
        const admins2 = await manager.allTokenAdmins();
        expect(admins1).to.eql(admins2);
      });
    });
    describe("when token address is in the admins list", () => {
      it("zeroes out token manager", async () => {
        let admins = await manager.allTokenAdmins();
        expect(admins.length).to.eq(2);
        await manager.deleteTokenAdmin(bondManager.address);
        admins = Array.from(await manager.allTokenAdmins());
        expect(admins.sort()).to.eql([
          ethers.constants.AddressZero,
          emissionManager.address,
        ]);
      });
    });
    describe("when called not by the owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await manager.transferOperator(other.address);
        await expect(
          manager.connect(other).deleteTokenAdmin(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
  describe("#addTokenAdmin", () => {
    describe("when token address is not in the admins list", () => {
      it("adds token to managers", async () => {
        const [_, other] = await ethers.getSigners();
        let admins = await manager.allTokenAdmins();
        expect(admins.length).to.eq(2);
        await manager.addTokenAdmin(other.address);
        admins = await manager.allTokenAdmins();
        expect(admins.length).to.eq(3);
        expect(admins[2]).to.eq(other.address);
      });
    });
    describe("when token address is in the admins list", () => {
      it("does nothing", async () => {
        let admins = await manager.allTokenAdmins();
        expect(admins.length).to.eq(2);
        await manager.addTokenAdmin(bondManager.address);
        admins = await manager.allTokenAdmins();
        expect(admins.length).to.eq(2);
      });
    });
    describe("when called not by the owner", () => {
      it("fails", async () => {
        const [_, other] = await ethers.getSigners();
        await manager.transferOperator(other.address);
        await expect(
          manager.connect(other).addTokenAdmin(other.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});
