import * as fs from "fs";

class UserRepository {
  async findById(userId: string): Promise<any> {
    return {
      id: userId,
      name: "Maria",
      email: "maria@email.com",
      active: true,
      role: "user",
    };
  }

  async save(user: any): Promise<void> {
    console.log("saving user", user.id);
  }
}

class EmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.log("sending email", { to, subject, body });
  }
}

export class UserManagerService {
  private repository = new UserRepository();
  private emailService = new EmailService();

  async updateUser(userId: string, payload: any, actor: any): Promise<any> {
    if (!actor) {
      throw new Error("Actor is required");
    }

    const user = await this.repository.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    if (actor.role !== "admin" && actor.id !== user.id) {
      throw new Error("Forbidden");
    }

    if (payload.email && !payload.email.includes("@")) {
      throw new Error("Invalid email");
    }

    if (payload.role && actor.role !== "admin") {
      throw new Error("Only admin can change role");
    }

    if (payload.name && payload.name.length < 3) {
      throw new Error("Name too short");
    }

    const updatedUser = {
      ...user,
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    if (updatedUser.role === "admin") {
      fs.appendFileSync(
        "./audit.log",
        `[AUDIT] user ${actor.id} promoted ${updatedUser.id} to admin\n`,
        "utf8",
      );
    }

    await this.repository.save(updatedUser);

    await this.emailService.send(
      updatedUser.email,
      "Conta atualizada",
      `Olá ${updatedUser.name}, sua conta foi atualizada com sucesso.`,
    );

    return updatedUser;
  }
}
