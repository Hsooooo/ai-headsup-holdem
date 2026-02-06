import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

const ERROR_STATUS_MAP: Record<string, number> = {
  // 404
  GAME_NOT_FOUND: HttpStatus.NOT_FOUND,
  NO_HAND: HttpStatus.NOT_FOUND,

  // 400
  BAD_BET: HttpStatus.BAD_REQUEST,
  BAD_RAISE: HttpStatus.BAD_REQUEST,
  RAISE_TOO_SMALL: HttpStatus.BAD_REQUEST,
  MISSING_COMMIT: HttpStatus.BAD_REQUEST,
  COMMIT_MISMATCH: HttpStatus.BAD_REQUEST,
  BAD_REVEAL_BODY: HttpStatus.BAD_REQUEST,
  UNKNOWN_ACTION: HttpStatus.BAD_REQUEST,
  HAND_ID_MISMATCH: HttpStatus.BAD_REQUEST,

  // 409 Conflict
  NOT_YOUR_TURN: HttpStatus.CONFLICT,
  CANNOT_CHECK: HttpStatus.CONFLICT,
  NOTHING_TO_CALL: HttpStatus.CONFLICT,
  USE_RAISE: HttpStatus.CONFLICT,
  USE_BET: HttpStatus.CONFLICT,
  HAND_ENDED: HttpStatus.CONFLICT,
  NOT_DEALT: HttpStatus.CONFLICT,
  ALREADY_REVEALED: HttpStatus.CONFLICT,
};

@Catch()
export class AnyExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      response.status(status).json(res);
      return;
    }

    const message: string = exception?.message ?? '';
    const mappedStatus = ERROR_STATUS_MAP[message];

    if (mappedStatus) {
      response.status(mappedStatus).json({
        statusCode: mappedStatus,
        error: message,
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
