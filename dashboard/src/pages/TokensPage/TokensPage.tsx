import { Grid } from '@material-ui/core';
import { nameprep } from 'ethers/lib/utils';
import Token from '../../components/Token';
import VeToken from '../../components/VeToken';

const FundsPage = () => {
  return (
    <Grid container spacing={3}>
      <VeToken />
      {['KlonX', 'KWBTC', 'KB-WBTC', 'Klon', 'WBTC', 'DAI'].map((name) => (
        <Token key={name} name={name} />
      ))}
    </Grid>
  );
};

export default FundsPage;
