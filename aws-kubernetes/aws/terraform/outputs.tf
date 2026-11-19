output "instance_id" {
  description = "DeploySync EC2 Instance ID"
  value       = aws_instance.deploysync_server.id
}

output "public_ip" {
  description = "DeploySync Elastic IP Address"
  value       = aws_eip.deploysync_eip.public_ip
}

output "web_ui_url" {
  description = "Direct HTTP URL to access DeploySync"
  value       = "http://${aws_eip.deploysync_eip.public_ip}:3000"
}

output "oauth_callback_url" {
  description = "GitHub OAuth App Authorization Callback URL"
  value       = "http://${aws_eip.deploysync_eip.public_ip}:3000/auth/callback"
}

