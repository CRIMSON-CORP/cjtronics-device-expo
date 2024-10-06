const screenReferenceToConfig: Record<
  string,
  { horizontal: boolean; landscape: boolean; split?: string }
> = {
  VBSGTREW43: {
    landscape: true,
    horizontal: false,
  },
  JHSFER2763: {
    horizontal: true,
    landscape: true,
    split: "80,20",
  },
  HDGTW5763: {
    horizontal: false,
    landscape: false,
  },
  SGDRWT5247: {
    horizontal: true,
    landscape: true,
    split: "50,50",
  },
  KJUYTE4352: {
    horizontal: false,
    landscape: false,
    split: "80,20",
  },
  SGHY5438JH: {
    horizontal: false,
    landscape: false,
    split: "50,50",
  },
};

export default screenReferenceToConfig;
