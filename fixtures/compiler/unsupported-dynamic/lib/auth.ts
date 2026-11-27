declare function NextAuth(config: object): { handlers: { GET: () => Response; POST: () => Response } };
export const {
  handlers: { GET, POST },
} = NextAuth({});
