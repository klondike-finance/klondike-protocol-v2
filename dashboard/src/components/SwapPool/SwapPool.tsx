import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';

const SwapPool = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['KlonDroidSwapPool'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const inToken = await pool.inToken();
        const outToken = await pool.outToken();
        const owner = await pool.owner();

        const start = await pool.start();
        const finish = await pool.finish();

        const values = {
          inToken,
          outToken,
          owner,
          blank1: null,
          start: toDate(start),
          finish: toDate(finish),
        };
        setData(values);
      } catch (e) {
        setError(e);
      }
    })();
  }, [provider, deployments]);

  return (
    <Grid item xs={12} md={6} lg={6}>
      <Card>
        <CardHeader title={'KlonDroid Swap Pool'} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default SwapPool;
