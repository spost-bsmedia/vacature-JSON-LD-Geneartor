export interface JobStructuredData {
  title: string;
  company: string;
  descriptionHtml: string;
  employmentTypes: string[];
  locality: string;
  region: string;
  postalCode: string;
  streetAddress: string;
  countryCode: string;
  remoteType: "ONSITE" | "HYBRID" | "REMOTE";
  salaryMinimum: number;
  salaryMaximum: number;
  salaryCurrency: string;
  salaryUnit: "HOUR" | "WEEK" | "MONTH" | "YEAR";
  datePosted: string;
  validThrough: string;
  url?: string;
}

export interface SampleJob {
  id: string;
  title: string;
  location: string;
  rawText: string;
}
