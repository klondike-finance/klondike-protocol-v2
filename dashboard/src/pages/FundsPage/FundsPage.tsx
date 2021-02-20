import { Grid } from '@material-ui/core';
import DevFund from '../../components/DevFund';
import StableFund from '../../components/StableFund';

const FundsPage = () => {
  return (
    <Grid container spacing={3}>
      <StableFund />
      <DevFund />
    </Grid>
  );
};

export default FundsPage;
