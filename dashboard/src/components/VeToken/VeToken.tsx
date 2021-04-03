import { Card, CardContent, CardHeader, CircularProgress, Grid } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ethers, BigNumber } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import { EthereumContext } from '../../App';
import { toDate, toDecimal } from '../../lib/utils';
import Entry from '../Entry';


const VeToken = () => {
  const { provider, deployments } = useContext(EthereumContext);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    (async () => {
      if (!provider || !deployments) return;
      const { address, abi } = deployments["VeKlonX"];
      
      const token = new ethers.Contract(address, abi, provider);
      try {
        const admin = await token.admin();
        const futureAdmin = await token.future_admin();
        const controller = await token.controller();
        const transfersEnabled = await token.transfersEnabled();
        const epoch = await token.epoch();
  
        let totalSupply = BigNumber.from(0);
        try {
          totalSupply = await token.totalSupply();
        } catch (e) {}
        
        const stakingTokenSupply = await token.supply();
        const decimals = (await token.decimals()).toNumber();        

        const values = {
          admin,
          futureAdmin,
          controller,
          blank1: null,
          transfersEnabled,
          epoch,
          decimals,
          blank2: null,
          totalSupply: toDecimal(totalSupply, decimals),
          stakingTokenSupply: toDecimal(stakingTokenSupply, decimals),
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
        <CardHeader title="VeKlonX" subheader={deployments && <Entry v={deployments["VeKlonX"].address} />} />
        <CardContent>
          {error && <Alert severity="error">{`Error fetching pair data: ${error}`}</Alert>}
          {!data && !error && <CircularProgress />}
          {data && !error && Object.keys(data).map((key) => <Entry key={key} k={key} v={data[key]} />)}
        </CardContent>
      </Card>
    </Grid>
  );
};

export default VeToken;
