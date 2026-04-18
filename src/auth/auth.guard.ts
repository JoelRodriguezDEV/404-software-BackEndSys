/*eslint-disable*/
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // 1. Extraemos el token de la cabecera "Authorization"
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(
        'Acceso denegado: Se requiere un Token de autorización.',
      );
    }

    try {
      // 2. Verificamos que el token sea real y no haya caducado
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET, // Debe ser el mismo que pusiste en app.module.ts
      });
      // 3. Pegamos la información del usuario a la petición para usarla después
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException(
        'El Token es inválido o ha expirado. Inicia sesión de nuevo.',
      );
    }

    return true; // 🟢 Luz verde, el usuario pasa
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
