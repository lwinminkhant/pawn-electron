import React from "react";
import { InterestVoucherBase, type InterestVoucherProps } from "./InterestVoucherBase";

export const NonGoldInterestVoucher: React.FC<InterestVoucherProps> = (props) => (
  <InterestVoucherBase
    {...props}
    includeWeight={false}
    headerAlt="Non-gold interest voucher header"
  />
);
