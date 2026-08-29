output "endpoint" { value = aws_db_instance.main.endpoint; sensitive = true }
output "password" { value = random_password.db.result; sensitive = true }
output "username" { value = aws_db_instance.main.username }
output "db_name"  { value = aws_db_instance.main.db_name }
