import { Grid } from '@material-ui/core';
import { nameprep } from 'ethers/lib/utils';
import Token from '../../components/Token';

const FundsPage = () => {
  return (
    <Grid container spacing={3}>
      {['Droid', 'Jedi', 'KWBTC', 'KB-WBTC', 'Klon', 'WBTC', 'DAI'].map((name) => (
        <Token key={name} name={name} />
      ))}
    </Grid>
  );
};

export default FundsPage;
