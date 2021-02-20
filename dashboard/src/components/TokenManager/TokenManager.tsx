import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate } from '../../lib/utils';
import Entry from '../Entry';

const TokenManager = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments['TokenManagerV1'];
      const pool = new ethers.Contract(address, abi, provider);
      try {
        const owner = await pool.owner();
        const operator = await pool.operator();
        const bondManager = await pool.bondManager();
        const emissionManager = await pool.emissionManager();
        const allTokens = await pool.allTokens();
        const isInitialized = await pool.isInitialized();
        const validTokenPermissions = await pool.validTokenPermissions();
        const uniswapFactory = await pool.uniswapFactory();

        const values = {
          owner,
          operator,
          bondManager,
          emissionManager,
          uniswapFactory,
          blank1: null,
          allTokens,
          blank2: null,
          isInitialized,
          validTokenPermissions,
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
        <CardHeader
          title="TokenManagerV1"
          subheader={deployments && <Entry v={deployments['TokenManagerV1'].address} />}
        />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default TokenManager;
