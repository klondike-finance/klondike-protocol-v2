import { Card, CardContent, CardHeader, CircularProgress, Grid, Paper, Typography } from '@material-ui/core';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import UniswapPage from '../../pages/UniswapPage';
import unipairabi from '../../data/unipairabi.json';
import { ethers } from 'ethers';
import { Alert } from '@material-ui/lab';
import styled from 'styled-components';
import Entry from '../Entry';

type PropsType = { token0: string; token1: string; pair: string };

const UniswapPool = ({ token0, token1, pair }: PropsType) => {
  const { provider, deployments } = useContext(EthereumContext);
  const [error, setError] = useState(null);
  const [reserve0, setReserve0] = useState<number | null>(null);
  const [reserve1, setReserve1] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const p = new ethers.Contract(pair, unipairabi, provider);
      try {
        if (!deployments) return;
        const contract0 = new ethers.Contract(deployments[token0].address, deployments[token0].abi, provider);
        const contract1 = new ethers.Contract(deployments[token1].address, deployments[token1].abi, provider);
        const decimals0 = await contract0.decimals();
        const decimals1 = await contract1.decimals();
        const [reserveA, reserveB] = await p.getReserves();
        const [res0, res1] =
          token0Address.toLowerCase() < token1Address.toLowerCase() ? [reserveA, reserveB] : [reserveB, reserveA];
        const [dec0, dec1] =
          token0Address.toLowerCase() < token1Address.toLowerCase() ? [decimals0, decimals1] : [decimals1, decimals0];
        const reserve0 = res0 / 10 ** dec0;
        const reserve1 = res1 / 10 ** dec1;
        setReserve0(reserve0);
        setReserve1(reserve1);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [pair]);
  if (!deployments) return null;
  const name = `${token1} - ${token0} Uniswap Pool`;
  const token0Address = deployments[token0].address;
  const token1Address = deployments[token1].address;
  const [t0, t1] = token0Address.toLowerCase() < token1Address.toLowerCase() ? [token0, token1] : [token1, token0];
  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title={name} subheader={<Entry v={pair} />} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {(!reserve0 || !reserve1) && !error && <CircularProgress />}
          <p>{reserve0 && reserve1 && `Reserve0: ${reserve0} ${t0}`}</p>
          <p>{reserve0 && reserve1 && `Reserve1: ${reserve1} ${t1}`}</p>
          <p>{reserve0 && reserve1 && `Price0: ${(reserve1 as any) / (reserve0 as any)} ${t1}/${t0}`}</p>
          <p>{reserve0 && reserve1 && `Price1: ${(reserve0 as any) / (reserve1 as any)} ${t0}/${t1}`}</p>
        </CardContent>
      </Card>
    </Grid>
  );
};

export default UniswapPool;
