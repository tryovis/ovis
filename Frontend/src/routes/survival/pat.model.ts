export class Pat {
    constructor(
      public time: number,
      public event: number,
      public group: number,
      public surv: number,
      public upper: number,
      public lower: number,
      public n: number,
      public nevent: number,
      public ncensor: number,
      public tumorID: string,
    ) {}
  }
  