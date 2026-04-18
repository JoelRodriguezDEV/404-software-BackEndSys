/*eslint-disable*/
import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Req,
  UseGuards, // 👈 1. Importados para seguridad y peticiones
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth/auth.guard'; // 👈 2. Importado tu guardia de seguridad

@Controller('api/auth')
export class AuthController {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // 1. ENDPOINT PARA INICIAR SESIÓN
  @Post('login')
  async login(@Body() body: any) {
    const { username, password } = body;

    // Buscar si el usuario existe
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new HttpException('Usuario no encontrado', HttpStatus.UNAUTHORIZED);
    }

    // Verificar si la contraseña coincide
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new HttpException('Contraseña incorrecta', HttpStatus.UNAUTHORIZED);
    }

    // Generamos el "Gafete" (Token)
    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = this.jwtService.sign(payload);

    // REGISTRO DE AUDITORÍA TRAS LOGIN EXITOSO
    await this.prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        details: `El usuario ${user.username} ha accedido al sistema.`,
        user: user.username,
      },
    });

    return {
      message: 'Acceso concedido',
      token,
      user: { username: user.username, role: user.role },
    };
  }

  // 2. ENDPOINT OCULTO PARA CREAR EL PRIMER ADMIN
  @Post('setup')
  async createFirstAdmin(@Body() body: any) {
    const { username, password } = body;

    const existing = await this.prisma.user.findFirst();
    if (existing)
      throw new HttpException(
        'El sistema ya fue inicializado',
        HttpStatus.FORBIDDEN,
      );

    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: { username, password: hashedPassword, role: 'ADMIN' },
    });
  }

  // 👇 3. NUEVO ENDPOINT PARA CREAR OPERADORES (PROTEGIDO)
  @Post('register')
  @UseGuards(AuthGuard) // 👈 Solo alguien con sesión iniciada puede entrar
  async registerUser(@Body() body: any, @Req() req: any) {
    // A. VERIFICACIÓN DE SEGURIDAD EXTREMA: Solo el ADMIN puede crear usuarios
    if (req.user.role !== 'ADMIN') {
      throw new HttpException(
        'Acceso denegado: Solo el Administrador Root puede crear usuarios.',
        HttpStatus.FORBIDDEN,
      );
    }

    const { username, password, role } = body;

    // B. Evitar duplicados
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw new HttpException(
        'El nombre de usuario ya está en uso',
        HttpStatus.BAD_REQUEST,
      );
    }

    // C. Encriptar la contraseña del nuevo empleado
    const hashedPassword = await bcrypt.hash(password, 10);

    // D. Guardar en la base de datos
    const newUser = await this.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role || 'RECEPTIONIST', // Por defecto, creamos recepcionistas
      },
    });

    // E. Guardar en el Log de Auditoría el movimiento
    await this.prisma.auditLog.create({
      data: {
        action: 'CREATE_USER',
        details: `Se creó un nuevo operador: ${username} con rol ${newUser.role}`,
        user: req.user.username,
        ip: req.ip,
      },
    });

    return {
      message: 'Operador creado exitosamente',
      username: newUser.username,
    };
  }
}
