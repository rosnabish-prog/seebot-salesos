/** Shared Google Identity Services browser surface across login, invitation and signing pages. */
export {};
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options:{client_id:string;callback:(response:{credential:string})=>void})=>void;
          renderButton: (element:HTMLElement,options:Record<string,unknown>)=>void;
        }
      }
    }
  }
}
