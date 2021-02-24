import { Grid, Paper } from '@material-ui/core';
import UniswapPool from '../../components/UniswapPool';
import { getDeployments, pairFor, UNISWAP_V2_FACTORY_ADDRESS } from '../../lib/utils';

const UniswapPage = () => {
  return (
    <Grid container spacing={3}>
      {getUniswapPools().map((pool) => (
        <UniswapPool key={pool.pair} {...pool} />
      ))}
    </Grid>
  );
};

const getUniswapPools = () => {
  const deployments = getDeployments();
  const kwbtc = deployments['KWBTC'];
  const wbtc = deployments['WBTC'];
  const jedi = deployments['Jedi'];
  const droid = deployments['Droid'];
  const dai = deployments['DAI'];
  const wbtcKwbtcLp = pairFor(UNISWAP_V2_FACTORY_ADDRESS, wbtc.address, kwbtc.address);
  const jediDaiLp = pairFor(UNISWAP_V2_FACTORY_ADDRESS, jedi.address, dai.address);
  const droidDaiLp = pairFor(UNISWAP_V2_FACTORY_ADDRESS, droid.address, dai.address);
  return [
    { token0: 'WBTC', token1: 'KWBTC', pair: wbtcKwbtcLp },
    { token0: 'DAI', token1: 'Jedi', pair: jediDaiLp },
    { token0: 'DAI', token1: 'Droid', pair: droidDaiLp },
  ];
};

export default UniswapPage;
