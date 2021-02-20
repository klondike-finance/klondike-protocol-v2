import { Grid } from '@material-ui/core';
import BondManager from '../../components/BondManager';

const ManagersPage = () => {
  return (
    <Grid container spacing={3}>
      <BondManager />
    </Grid>
  );
};

export default ManagersPage;
