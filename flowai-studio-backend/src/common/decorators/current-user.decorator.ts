import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface CurrentUserPayload {
  userId: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as CurrentUserPayload | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
