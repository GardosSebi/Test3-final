import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { hash } from 'phc-argon2'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'USER']).optional().default('USER'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, name, password } = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const password_hash = await hash(password)

    // Create workspace and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // First create workspace without userId (will be updated)
      const workspace = await tx.workspace.create({
        data: {
          name: `${name.trim()}'s Workspace`,
        },
      })

      // Create user with workspace
      const user = await tx.user.create({
        data: {
          email,
          name: name.trim(),
          password_hash,
          role: body.role || 'USER',
          workspaceId: workspace.id,
        },
        select: {
          id: true,
          email: true,
          name: true,
          created_at: true,
        },
      })

      // Update workspace with actual userId
      await tx.workspace.update({
        where: { id: workspace.id },
        data: { userId: user.id },
      })

      return user
    })

    return NextResponse.json({ user: result }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    // Log error for debugging (visible in Vercel logs)
    console.error('Registration error:', error)
    
    // Check for Prisma/database errors
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code?: string; message?: string }
      
      // Database connection errors
      if (prismaError.code === 'P1001' || prismaError.code === 'P1002') {
        return NextResponse.json(
          { error: 'Database connection failed. Please check DATABASE_URL configuration.' },
          { status: 500 }
        )
      }
      
      // Unique constraint violation
      if (prismaError.code === 'P2002') {
        return NextResponse.json(
          { error: 'User already exists' },
          { status: 400 }
        )
      }
      
      // Other Prisma errors
      return NextResponse.json(
        { 
          error: 'Database error', 
          details: process.env.NODE_ENV === 'development' ? prismaError.message : undefined 
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    )
  }
}

